import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Trash2, Users, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { useIsMobile } from "@/hooks/use-mobile";

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

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-right", totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis-left", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "ellipsis-left", currentPage - 1, currentPage, currentPage + 1, "ellipsis-right", totalPages];
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const isMobile = useIsMobile();

  const [users, setUsers] = useState<SSOUser[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  const [currentPage, setCurrentPage] = useState(1);

  const loadUsers = () => {
    api
      .get<SSOUser[]>("/users/")
      .then((r) => setUsers(r.data))
      .catch(() => {
        toast.error("Не удалось загрузить пользователей");
        setUsers([]);
      });
  };

  useEffect(() => {
    if (!isLoggedIn) { navigate("/"); return; }
    loadUsers();
  }, [isLoggedIn, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageSize = isMobile ? 8 : 12;
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const haystack = `${user.full_name} ${user.username} ${APP_LABELS[user.app] ?? user.app} ${ROLE_LABELS[user.role] ?? user.role}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [users, searchQuery]);
  const totalUsers = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const paginationItems = buildPaginationItems(currentPage, totalPages);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (users === null) return;
    const nextTotalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    setCurrentPage((prev) => Math.min(prev, nextTotalPages));
  }, [users, pageSize, totalUsers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Пользователи</h1>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={loadUsers} title="Обновить">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={() => setCreateOpen(true)} title="Добавить администратора">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {users === null ? (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Нет пользователей</p>
          <p className="text-xs text-muted-foreground">Нажмите +, чтобы добавить администратора</p>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск пользователя..."
            />
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              По вашему запросу ничего не найдено
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card overflow-hidden">
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
                    {paginatedUsers.map((u) => (
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
              </div>
              <div className="flex flex-col gap-2 mt-3">
                <p className="text-xs text-muted-foreground text-center sm:text-left">
                  Показаны {paginatedUsers.length} из {totalUsers}
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          setCurrentPage((prev) => Math.max(1, prev - 1));
                        }}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
                      />
                    </PaginationItem>
                    {paginationItems.map((item, index) => (
                      <PaginationItem key={`${item}-${index}`}>
                        {typeof item === "number" ? (
                          <PaginationLink
                            href="#"
                            isActive={item === currentPage}
                            onClick={(event) => {
                              event.preventDefault();
                              setCurrentPage(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        ) : (
                          <PaginationEllipsis />
                        )}
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                        }}
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </>
      )}

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
