import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { useAuth } from "@/context/AuthContext";
import api from "@/api/client";
import type { Service, FieldDefinition } from "@/types";


interface FieldFormData {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string;
}

export default function ManageServicesPage() {
  const { auth } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [requiresAttachment, setRequiresAttachment] = useState(false);
  const [fields, setFields] = useState<FieldFormData[]>([]);

  const fetchServices = () => {
    const params = auth?.department_id
      ? { department_id: auth.department_id }
      : {};
    api.get<Service[]>("/services/", { params }).then((res) => {
      setServices(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setRequiresAttachment(false);
    setFields([]);
    setEditingService(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (service: Service) => {
    setEditingService(service);
    setName(service.name);
    setDescription(service.description || "");
    setRequiresAttachment(service.requires_attachment);
    setFields(
      service.required_fields.map((f: FieldDefinition) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options?.join(", ") || "",
      }))
    );
    setDialogOpen(true);
  };

  const addField = () => {
    setFields([
      ...fields,
      { name: "", label: "", type: "text", required: true, options: "" },
    ]);
  };

  const updateField = (index: number, key: keyof FieldFormData, value: string | boolean) => {
    const updated = [...fields];
    (updated[index] as any)[key] = value;
    if (key === "label" && !updated[index].name) {
      updated[index].name = (value as string).toLowerCase().replace(/\s+/g, "_");
    }
    setFields(updated);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredFields = fields.map((f) => ({
      name: f.name || f.label.toLowerCase().replace(/\s+/g, "_"),
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.type === "select" && f.options
        ? f.options.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined,
    }));

    const payload = {
      department_id: auth?.department_id,
      name,
      description: description || null,
      required_fields: requiredFields,
      requires_attachment: requiresAttachment,
    };

    try {
      if (editingService) {
        await api.put(`/services/${editingService.id}`, payload);
        toast.success("Услуга обновлена");
      } else {
        await api.post("/services/", payload);
        toast.success("Услуга создана");
      }
      setDialogOpen(false);
      resetForm();
      fetchServices();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Ошибка сохранения";
      toast.error(msg);
    }
  };

  const handleDelete = (serviceId: string) => {
    setDeleteTargetId(serviceId);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.delete(`/services/${deleteTargetId}`);
      toast.success("Услуга удалена");
    } catch {
      toast.error("Не удалось удалить услугу");
    } finally {
      setDeleteTargetId(null);
      fetchServices();
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
        title="Управление услугами"
        description="Создайте и настройте услуги для студентов"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Добавить услугу
          </Button>
        }
      />

      {services.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Услуг пока нет. Создайте первую!</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <Card key={service.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                  {service.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {service.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(service)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(service.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Полей: {service.required_fields.length}
                  </Badge>
                  {service.requires_attachment && (
                    <Badge variant="outline">Нужны документы</Badge>
                  )}
                  <Badge variant={service.is_active ? "success" : "destructive"}>
                    {service.is_active ? "Активна" : "Неактивна"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingService ? "Редактировать услугу" : "Новая услуга"}
            </DialogTitle>
            <DialogDescription>
              Настройте услугу и определите поля формы заявки
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="svc-name">Название</Label>
                <Input
                  id="svc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Справка об обучении"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="svc-desc">Описание</Label>
                <Textarea
                  id="svc-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Описание услуги..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="svc-attachment"
                  checked={requiresAttachment}
                  onChange={(e) => setRequiresAttachment(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="svc-attachment">
                  Требуется прикрепление документов
                </Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Поля формы</h3>
                <Button type="button" variant="outline" size="sm" onClick={addField} className="gap-1">
                  <Plus className="h-4 w-4" />
                  Добавить поле
                </Button>
              </div>

              {fields.map((field, idx) => (
                <Card key={idx}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          Поле {idx + 1}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeField(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Метка</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(idx, "label", e.target.value)}
                          placeholder="ФИО"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Тип</Label>
                        <Select
                          value={field.type}
                          onChange={(e) => updateField(idx, "type", e.target.value)}
                        >
                          <option value="text">Текст</option>
                          <option value="textarea">Многострочный текст</option>
                          <option value="number">Число</option>
                          <option value="date">Дата</option>
                          <option value="select">Выпадающий список</option>
                        </Select>
                      </div>
                    </div>
                    {field.type === "select" && (
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Варианты (через запятую)
                        </Label>
                        <Input
                          value={field.options}
                          onChange={(e) => updateField(idx, "options", e.target.value)}
                          placeholder="Вариант 1, Вариант 2, Вариант 3"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(idx, "required", e.target.checked)}
                        className="rounded"
                      />
                      <Label className="text-xs">Обязательное</Label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button type="submit" className="w-full">
              {editingService ? "Сохранить" : "Создать услугу"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить услугу?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие необратимо.
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
