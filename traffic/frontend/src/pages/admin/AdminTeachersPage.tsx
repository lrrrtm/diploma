import { useEffect, useState } from "react";
import { AlertCircle, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { goToSSOLogin } from "@/lib/sso";
import { toast } from "sonner";

interface Teacher {
  id: string;
  username: string;
  full_name: string;
  created_at: string | null;
}

export default function AdminTeachersPage() {
  const { isLoggedIn, role } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || role !== "admin") { goToSSOLogin(); return; }
    load();
  }, [isLoggedIn, role]); // eslint-disable-line react-hooks/exhaustive-deps

  function load() {
    api.get<Teacher[]>("/teachers/").then((r) => setTeachers(r.data)).catch(() => setTeachers([]));
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
      await api.delete(`/teachers/${pendingDeleteId}`);
      toast.success("Преподаватель удалён");
      load();
    } catch {
      toast.error("Не удалось удалить преподавателя");
    } finally {
      setPendingDeleteId(null);
    }
  }

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post("/teachers/", {
        username: (form.get("username") as string).trim(),
        password: form.get("password") as string,
        full_name: (form.get("full_name") as string).trim(),
      });
      setShowForm(false);
      load();
      toast.success("Преподаватель создан");
      (e.target as HTMLFormElement).reset();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Ошибка при создании");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Преподаватели</h1>
          <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Добавить
          </Button>
        </div>
        {/* Create form */}
        {showForm && (
          <Card>
            <CardContent className="px-4 py-4">
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">ФИО</Label>
                  <Input id="full_name" name="full_name" required placeholder="Иванов Иван Иванович" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Логин</Label>
                  <Input id="username" name="username" required placeholder="ivanov" autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Пароль</Label>
                  <InputGroup>
                    <InputGroupInput id="password" name="password" type={showPw ? "text" : "password"} required autoComplete="new-password" />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton size="icon-sm" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}>
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving} size="sm">
                    {saving ? "Сохранение..." : "Создать"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setError(null); }}>
                    Отмена
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* List */}
        {teachers === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Нет преподавателей</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teachers.map((t) => (
              <Card key={t.id}>
                <CardContent className="px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{t.full_name}</p>
                    <p className="text-xs text-muted-foreground">@{t.username}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setPendingDeleteId(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Удалить преподавателя?"
        onConfirm={confirmDelete}
      />
    </>
  );
}
