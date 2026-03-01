import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Link2, Plus, QrCode, RefreshCw, Trash2, Unlink, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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

export default function AdminTeachersPage() {
  const { teachers, refresh } = useAdminData();
  const isMobile = useIsMobile();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingUnlinkTelegramId, setPendingUnlinkTelegramId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [telegramLinkDialogOpen, setTelegramLinkDialogOpen] = useState(false);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [telegramRegisterLink, setTelegramRegisterLink] = useState("");
  const [telegramRegisterTeacherName, setTelegramRegisterTeacherName] = useState("");

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

  async function confirmUnlinkTelegram() {
    if (!pendingUnlinkTelegramId) return;
    try {
      await api.delete(`/teachers/${pendingUnlinkTelegramId}/telegram-link`);
      toast.success("Telegram успешно отвязан");
      refresh();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Не удалось отвязать Telegram");
    } finally {
      setPendingUnlinkTelegramId(null);
    }
  }

  async function openTelegramLinkDialog(teacherId: string, teacherName: string) {
    setTelegramRegisterTeacherName(teacherName);
    setTelegramLinkLoading(true);
    setTelegramRegisterLink("");
    setTelegramLinkDialogOpen(true);
    try {
      const response = await api.get<{ link: string }>(`/teachers/${teacherId}/telegram-register-link`);
      setTelegramRegisterLink(response.data.link);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Не удалось получить ссылку регистрации в Telegram");
    } finally {
      setTelegramLinkLoading(false);
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

  const pageSize = isMobile ? 8 : 12;
  const filteredTeachers = useMemo(() => {
    if (!teachers) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter((teacher) => {
      const haystack = `${teacher.full_name} ${teacher.username ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [teachers, searchQuery]);
  const totalItems = filteredTeachers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginationItems = buildPaginationItems(currentPage, totalPages);
  const paginatedTeachers = filteredTeachers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (teachers === null) return;
    const nextTotalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    setCurrentPage((prev) => Math.min(prev, nextTotalPages));
  }, [teachers, pageSize, totalItems]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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
        <>
          <div className="mb-3">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск преподавателя или логина..."
            />
          </div>

          {filteredTeachers.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              По вашему запросу ничего не найдено
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                  <TableHeader className={isMobile ? "sr-only" : undefined}>
                    <TableRow>
                      <TableHead className="w-[42%]">Преподаватель</TableHead>
                      <TableHead className="w-[30%]">Логин</TableHead>
                      <TableHead className="w-[14%] text-center">Telegram</TableHead>
                      <TableHead className="w-[14%] text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTeachers.map((teacher) => (
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
                            {teacher.username ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell
                          className={isMobile ? "flex items-center justify-between gap-3 px-0 py-1" : "text-center"}
                        >
                          {isMobile && <span className="text-xs text-muted-foreground">Telegram</span>}
                          <span
                            className={`inline-flex h-2.5 w-2.5 rounded-full ${
                              teacher.telegram_linked ? "bg-emerald-500" : "bg-destructive"
                            }`}
                            title={teacher.telegram_linked ? "Привязан" : "Не привязан"}
                          />
                        </TableCell>
                        <TableCell
                          className={isMobile ? "flex justify-end px-0 pt-2 pb-1" : "text-right"}
                        >
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-primary"
                              onClick={() => openTelegramLinkDialog(teacher.id, teacher.full_name)}
                              title="QR для привязки Telegram"
                              aria-label={`Показать QR для привязки Telegram ${teacher.full_name}`}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-amber-500"
                              onClick={() => setPendingUnlinkTelegramId(teacher.id)}
                              title="Отвязать Telegram"
                              aria-label={`Отвязать Telegram у преподавателя ${teacher.full_name}`}
                              disabled={!teacher.telegram_linked}
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
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
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-2 mt-3">
                <p className="text-xs text-muted-foreground text-center sm:text-left">
                  Показаны {paginatedTeachers.length} из {totalItems}
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

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Удалить преподавателя?"
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={pendingUnlinkTelegramId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnlinkTelegramId(null);
        }}
        title="Отвязать Telegram?"
        description="Связь с Telegram будет удалена. Преподавателю нужно будет заново пройти привязку по QR."
        confirmLabel="Отвязать"
        onConfirm={confirmUnlinkTelegram}
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

      <Dialog open={telegramLinkDialogOpen} onOpenChange={setTelegramLinkDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Привязка Telegram</DialogTitle>
            <DialogDescription>
              {telegramRegisterTeacherName}
            </DialogDescription>
          </DialogHeader>

          {telegramLinkLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="mx-auto h-56 w-56 rounded-lg" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-4/5 rounded" />
            </div>
          ) : telegramRegisterLink ? (
            <div className="space-y-4 py-1">
              <div className="flex justify-center">
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <QRCodeSVG value={telegramRegisterLink} size={220} level="M" />
                </div>
              </div>
              <a
                href={telegramRegisterLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary underline break-all"
              >
                <Link2 className="h-4 w-4 shrink-0" />
                {telegramRegisterLink}
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              Не удалось получить ссылку регистрации.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
