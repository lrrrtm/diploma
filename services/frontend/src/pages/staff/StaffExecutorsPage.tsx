import { useEffect, useState } from "react";
import { Users, Trash2, Plus, User, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import api from "@/api/client";
import type { Executor } from "@/types";

export default function StaffExecutorsPage() {
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const fetchExecutors = () => {
    api.get<Executor[]>("/executors/").then((res) => {
      setExecutors(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchExecutors();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.post("/executors/", { name, username, password });
      toast.success("Исполнитель создан");
      setDialogOpen(false);
      setName("");
      setUsername("");
      setPassword("");
      fetchExecutors();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Ошибка при создании";
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.delete(`/executors/${deleteTargetId}`);
      toast.success("Исполнитель удалён");
    } catch {
      toast.error("Не удалось удалить исполнителя");
    } finally {
      setDeleteTargetId(null);
      fetchExecutors();
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-8 w-8 rounded-md shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Исполнители"
        description="Сотрудники, которым назначаются заявки"
        actions={
          <Button size="sm" className="gap-2" onClick={() => { setError(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
        }
      />

      {executors.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Исполнителей пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {executors.map((ex) => (
            <Card key={ex.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{ex.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTargetId(ex.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый исполнитель</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="exec-name">Имя</Label>
              <Input
                id="exec-name"
                placeholder="Иванов Иван"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exec-username">Логин (SSO)</Label>
              <Input
                id="exec-username"
                placeholder="ivanov"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exec-password">Пароль</Label>
              <InputGroup>
                <InputGroupInput
                  id="exec-password"
                  type={showPw ? "text" : "password"}
                  placeholder="Минимум 4 символа"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={4}
                  autoComplete="new-password"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-sm" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Создание..." : "Создать"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(o) => !o && setDeleteTargetId(null)}
        title="Удалить исполнителя?"
        description="Исполнитель будет удалён. Назначенные ему заявки станут без исполнителя."
        onConfirm={handleDelete}
      />
    </div>
  );
}
