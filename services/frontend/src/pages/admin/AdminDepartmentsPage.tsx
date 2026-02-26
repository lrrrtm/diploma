import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import api from "@/api/client";
import type { Department } from "@/types";

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const fetchDepartments = () => {
    api.get<Department[]>("/departments/").then((res) => {
      setDepartments(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const openCreate = () => {
    setEditingDept(null);
    setName("");
    setDescription("");
    setLogin("");
    setPassword("");
    setDialogOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setName(dept.name);
    setDescription(dept.description || "");
    setLogin(dept.login || "");
    setPassword("");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name,
      description: description || null,
      login: login || null,
    };
    if (password) {
      payload.password = password;
    }

    try {
      if (editingDept) {
        await api.put(`/departments/${editingDept.id}`, payload);
        toast.success("Структура обновлена");
      } else {
        await api.post("/departments/", payload);
        toast.success("Структура создана");
      }
      setDialogOpen(false);
      fetchDepartments();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Ошибка сохранения";
      toast.error(msg);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.delete(`/departments/${deleteTargetId}`);
      toast.success("Структура удалена");
    } catch {
      toast.error("Не удалось удалить структуру");
    } finally {
      setDeleteTargetId(null);
      fetchDepartments();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Управление структурами"
        description="Добавьте и настройте структуры университета"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Добавить структуру
          </Button>
        }
      />

      {departments.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Структуры пока не добавлены. Создайте первую!
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <Card key={dept.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle className="text-lg">{dept.name}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(dept)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(dept.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {dept.description || "Описание отсутствует"}
                </p>
                {dept.login && (
                  <Badge variant="secondary">Логин: {dept.login}</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDept ? "Редактировать структуру" : "Новая структура"}
            </DialogTitle>
            <DialogDescription>
              Укажите данные структуры и учётные данные для входа
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Название</Label>
              <Input
                id="dept-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Стипендиальный отдел"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dept-desc">Описание</Label>
              <Textarea
                id="dept-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание деятельности структуры..."
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="dept-login">Логин для входа</Label>
              <Input
                id="dept-login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="stipendial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dept-password">
                {editingDept ? "Новый пароль (оставьте пустым, чтобы не менять)" : "Пароль"}
              </Label>
              <Input
                id="dept-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editingDept ? "Оставьте пустым" : "Пароль"}
              />
            </div>

            <Button type="submit" className="w-full">
              {editingDept ? "Сохранить" : "Создать"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить структуру?</AlertDialogTitle>
            <AlertDialogDescription>
              Все связанные услуги и заявки также будут удалены. Это действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
