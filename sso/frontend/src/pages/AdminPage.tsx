import { useEffect, useRef, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Users, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

interface SSOUser {
  id: string;
  username: string;
  full_name: string;
  app: string;
  role: string;
  entity_id: string | null;
  is_active: boolean;
  created_at: string;
}

const APP_LABELS: Record<string, string> = {
  sso: "Политехник.SSO",
  services: "Политехник.Услуги",
  traffic: "Политехник.Посещаемость",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  staff: "Сотрудник",
  executor: "Исполнитель",
  teacher: "Преподаватель",
};

const APP_BADGE_CLASS: Record<string, string> = {
  sso: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  services: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  traffic: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

// ---------------------------------------------------------------------------
// Login auto-generation from Russian full name
// ---------------------------------------------------------------------------

const TRANS: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",
  й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",
  у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",
  э:"e",ю:"yu",я:"ya",
};

function translit(s: string): string {
  return s.toLowerCase().split("").map((c) => TRANS[c] ?? c).join("");
}

function generateLogin(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [last, ...rest] = parts;
  const lastName = translit(last).replace(/[^a-z0-9]/g, "");
  const initials = rest.map((p) => translit(p[0] ?? "").replace(/[^a-z]/g, "")).join("");
  return initials ? `${lastName}.${initials}` : lastName;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  const [users, setUsers] = useState<SSOUser[] | null>(null);
  const [appFilter, setAppFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SSOUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [selectedApp, setSelectedApp] = useState("services");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameManual, setUsernameManual] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "taken">("idle");
  const checkAbortRef = useRef<AbortController | null>(null);

  const loadUsers = () => {
    const params = appFilter !== "all" ? `?app_filter=${appFilter}` : "";
    api
      .get<SSOUser[]>(`/users/${params}`)
      .then((r) => setUsers(r.data))
      .catch(() => {
        toast.error("Не удалось загрузить пользователей");
        setUsers([]);
      });
  };

  useEffect(() => {
    if (!isLoggedIn) { navigate("/"); return; }
    loadUsers();
  }, [isLoggedIn, appFilter, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate and check username whenever fullName changes (unless manually overridden)
  useEffect(() => {
    if (usernameManual) return;
    const base = generateLogin(fullName);
    if (!base) { setUsername(""); setUsernameStatus("idle"); return; }

    setUsernameStatus("checking");
    if (checkAbortRef.current) checkAbortRef.current.abort();
    const ctrl = new AbortController();
    checkAbortRef.current = ctrl;

    (async () => {
      let candidate = base;
      let suffix = 2;
      try {
        while (true) {
          const res = await api.get<{ available: boolean }>(
            `/users/check-username?username=${encodeURIComponent(candidate)}`,
            { signal: ctrl.signal },
          );
          if (res.data.available) {
            setUsername(candidate);
            setUsernameStatus("idle");
            return;
          }
          if (suffix > 20) break;
          candidate = `${base}${suffix++}`;
        }
        setUsername(base);
        setUsernameStatus("taken");
      } catch {
        // aborted or network error — ignore
      }
    })();
  }, [fullName, usernameManual]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetCreateForm = () => {
    setFullName("");
    setUsername("");
    setUsernameManual(false);
    setUsernameStatus("idle");
    if (checkAbortRef.current) checkAbortRef.current.abort();
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setCreating(true);
    try {
      await api.post("/users/", {
        username,
        password: form.get("password"),
        full_name: fullName,
        app: selectedApp,
        role: "admin",
      });
      toast.success("Администратор создан");
      setCreateOpen(false);
      resetCreateForm();
      setUsers(null);
      loadUsers();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Не удалось создать пользователя";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      toast.success("Пользователь удалён");
      setDeleteTarget(null);
      setUsers((prev) => prev?.filter((u) => u.id !== deleteTarget.id) ?? null);
    } catch {
      toast.error("Не удалось удалить пользователя");
    }
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["all", "services", "traffic"] as const).map((app) => {
            const count =
              app === "all"
                ? (users?.length ?? "—")
                : (users?.filter((u) => u.app === app).length ?? "—");
            const label =
              app === "all" ? "Всего пользователей" : APP_LABELS[app];
            return (
              <Card
                key={app}
                className={`cursor-pointer transition-colors ${appFilter === app ? "border-primary" : ""}`}
                onClick={() => setAppFilter(app)}
              >
                <CardContent className="pt-4 pb-3">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Users table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Пользователи
              {appFilter !== "all" && (
                <Badge variant="secondary">{APP_LABELS[appFilter]}</Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Добавить администратора
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {users === null ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Нет пользователей</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Приложение</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className={!u.is_active ? "opacity-50" : ""}>
                      <TableCell>
                        <p className="text-sm font-medium">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{u.username}</p>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${APP_BADGE_CLASS[u.app] ?? ""}`}
                        >
                          {APP_LABELS[u.app] ?? u.app}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </TableCell>
                      <TableCell>
                        {/* Can't delete sso admin itself */}
                        {!(u.app === "sso" && u.role === "admin") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      {/* Create admin dialog */}
      <AlertDialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreateForm(); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Новый администратор приложения</AlertDialogTitle>
            <AlertDialogDescription>
              Создайте учётную запись для администратора одного из приложений.
              Остальных пользователей (сотрудников, исполнителей, преподавателей) создают
              сами администраторы через интерфейс приложения.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form id="create-form" onSubmit={handleCreate} className="space-y-3 mt-1">
            <div className="space-y-1.5">
              <Label htmlFor="cf-app">Приложение</Label>
              <Select value={selectedApp} onValueChange={setSelectedApp}>
                <SelectTrigger id="cf-app">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="services">Политехник.Услуги</SelectItem>
                  <SelectItem value="traffic">Политехник.Посещаемость</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-full-name">Полное имя</Label>
              <Input
                id="cf-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cf-username">Логин</Label>
                {usernameStatus === "checking" && (
                  <span className="text-xs text-muted-foreground">проверка...</span>
                )}
                {usernameStatus === "taken" && (
                  <span className="text-xs text-destructive">логин занят</span>
                )}
              </div>
              <Input
                id="cf-username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setUsernameManual(true); setUsernameStatus("idle"); }}
                required
                autoComplete="off"
                placeholder="авто из имени"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-password">Пароль</Label>
              <InputGroup>
                <InputGroupInput
                  id="cf-password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="new-password"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-sm" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              form="create-form"
              disabled={creating}
              onClick={(e) => {
                // Let the form submit handle it — don't close dialog yet
                e.preventDefault();
                document.getElementById("create-form")?.dispatchEvent(
                  new Event("submit", { bubbles: true, cancelable: true })
                );
              }}
            >
              {creating ? "Создание..." : "Создать"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
            <AlertDialogDescription>
              Пользователь <span className="font-medium">{deleteTarget?.full_name}</span>{" "}
              ({deleteTarget?.username}) будет удалён. Это действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
