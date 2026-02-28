import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

interface Teacher {
  id: string;
  username: string;
  full_name: string;
  created_at: string | null;
}

export default function AdminTeachersPage() {
  const navigate = useNavigate();
  const { isLoggedIn, role } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn || role !== "admin") { navigate("/admin/login"); return; }
    load();
  }, [isLoggedIn, role, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  function load() {
    api.get<Teacher[]>("/teachers/").then((r) => setTeachers(r.data)).catch(() => setTeachers([]));
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить преподавателя?")) return;
    await api.delete(`/teachers/${id}`);
    load();
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
      (e.target as HTMLFormElement).reset();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Ошибка при создании");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/admin/tablets" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="font-semibold text-sm flex-1">Преподаватели</p>
        <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Добавить
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-3">
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
                  <Input id="password" name="password" type="password" required autoComplete="new-password" />
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
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
        ) : teachers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Нет преподавателей</p>
        ) : (
          teachers.map((t) => (
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
                  onClick={() => handleDelete(t.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
