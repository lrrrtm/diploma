import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import api from "@/api/client";
import { useAdminData } from "@/context/AdminDataContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

type LoginStatus = "idle" | "checking" | "available" | "taken" | "error";

const TRANS: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

function translit(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => TRANS[char] ?? char)
    .join("");
}

function generateLogin(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [lastNameRaw, ...rest] = parts;
  const lastName = translit(lastNameRaw).replace(/[^a-z0-9]/g, "");
  const initials = rest
    .map((part) => translit(part[0] ?? "").replace(/[^a-z]/g, ""))
    .join("");
  return initials ? `${lastName}.${initials}` : lastName;
}

export default function AdminTeachersPage() {
  const { teachers, refresh } = useAdminData();
  const isMobile = useIsMobile();

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [generatedUsername, setGeneratedUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");
  const [loginStatusText, setLoginStatusText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const usernameRequestIdRef = useRef(0);

  function resetDialogState() {
    setFullName("");
    setGeneratedUsername("");
    setPassword("");
    setShowPw(false);
    setLoginStatus("idle");
    setLoginStatusText(null);
    setSaving(false);
    setFormError(null);
    usernameRequestIdRef.current += 1;
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
      await api.delete(`/teachers/${pendingDeleteId}`);
      toast.success("Преподаватель удалён");
      refresh();
    } catch {
      toast.error("Не удалось удалить преподавателя");
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function resolveAvailableLogin(baseLogin: string) {
    const requestId = ++usernameRequestIdRef.current;
    setLoginStatus("checking");
    setLoginStatusText("Проверка логина в SSO...");

    for (let suffix = 0; suffix <= 50; suffix += 1) {
      const candidate = suffix === 0 ? baseLogin : `${baseLogin}${suffix + 1}`;
      try {
        const response = await api.get<{ available: boolean }>(
          `/teachers/check-username?username=${encodeURIComponent(candidate)}`
        );
        if (requestId !== usernameRequestIdRef.current) return;
        if (response.data.available) {
          setGeneratedUsername(candidate);
          setLoginStatus("available");
          setLoginStatusText("Логин свободен");
          return;
        }
      } catch {
        if (requestId !== usernameRequestIdRef.current) return;
        setLoginStatus("error");
        setLoginStatusText("Не удалось проверить логин в SSO");
        return;
      }
    }

    if (requestId !== usernameRequestIdRef.current) return;
    setGeneratedUsername(baseLogin);
    setLoginStatus("taken");
    setLoginStatusText("Не удалось подобрать свободный логин");
  }

  useEffect(() => {
    setFormError(null);
    const baseLogin = generateLogin(fullName);

    if (!baseLogin) {
      usernameRequestIdRef.current += 1;
      setGeneratedUsername("");
      setLoginStatus("idle");
      setLoginStatusText(null);
      return;
    }

    setGeneratedUsername(baseLogin);
    const timer = setTimeout(() => {
      void resolveAvailableLogin(baseLogin);
    }, 250);

    return () => clearTimeout(timer);
  }, [fullName]);

  const canSave =
    fullName.trim().length > 0 &&
    password.length > 0 &&
    generatedUsername.length > 0 &&
    loginStatus === "available" &&
    !saving;

  async function handleCreateTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setFormError(null);

    try {
      await api.post("/teachers/", {
        username: generatedUsername,
        password,
        full_name: fullName.trim(),
      });
      toast.success("Преподаватель создан");
      setAddDialogOpen(false);
      resetDialogState();
      refresh();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFormError(detail ?? "Не удалось создать преподавателя");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Преподаватели</h1>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={refresh} title="Обновить">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            title="Добавить преподавателя"
            onClick={() => {
              resetDialogState();
              setAddDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {teachers === null ? (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : teachers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Нет преподавателей</p>
          <p className="text-xs text-muted-foreground">Нажмите +, чтобы добавить преподавателя</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader className={isMobile ? "sr-only" : undefined}>
              <TableRow>
                <TableHead className="w-[52%]">Преподаватель</TableHead>
                <TableHead className="w-[34%]">Логин</TableHead>
                <TableHead className="w-[14%] text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((teacher) => (
                <TableRow
                  key={teacher.id}
                  className={isMobile ? "block px-3 py-2 border-b last:border-b-0" : undefined}
                >
                  <TableCell
                    className={
                      isMobile
                        ? "flex items-center justify-between gap-3 px-0 py-1"
                        : "font-medium"
                    }
                  >
                    {isMobile && <span className="text-xs text-muted-foreground">Преподаватель</span>}
                    <span className="text-right sm:text-left">{teacher.full_name}</span>
                  </TableCell>
                  <TableCell
                    className={
                      isMobile
                        ? "flex items-center justify-between gap-3 px-0 py-1"
                        : "font-mono text-xs"
                    }
                  >
                    {isMobile && <span className="text-xs text-muted-foreground">Логин</span>}
                    <span className="text-right sm:text-left break-all">
                      {teacher.username ? `@${teacher.username}` : "—"}
                    </span>
                  </TableCell>
                  <TableCell
                    className={isMobile ? "flex justify-end px-0 pt-2 pb-1" : "text-right"}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDeleteId(teacher.id)}
                      title="Удалить преподавателя"
                      aria-label={`Удалить преподавателя ${teacher.full_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Удалить преподавателя?"
        onConfirm={confirmDelete}
      />

      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) resetDialogState();
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Добавить преподавателя</DialogTitle>
            <DialogDescription>
              Логин генерируется автоматически и проверяется в SSO
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4 pt-1" onSubmit={handleCreateTeacher}>
            <div className="space-y-1.5">
              <Label htmlFor="teacher_full_name">ФИО</Label>
              <Input
                id="teacher_full_name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Иванов Иван Иванович"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="teacher_username">Логин</Label>
              <Input
                id="teacher_username"
                value={generatedUsername}
                readOnly
                disabled
                aria-invalid={loginStatus === "error" || loginStatus === "taken"}
                placeholder="Будет сгенерирован автоматически"
              />
              {loginStatusText && (
                <p
                  className={`text-xs ${
                    loginStatus === "error" || loginStatus === "taken"
                      ? "text-destructive"
                      : loginStatus === "available"
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {loginStatusText}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="teacher_password">Пароль</Label>
              <InputGroup>
                <InputGroupInput
                  id="teacher_password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  required
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-sm"
                    onClick={() => setShowPw((prev) => !prev)}
                    aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={!canSave}>
                {saving ? "Создание..." : "Создать"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
