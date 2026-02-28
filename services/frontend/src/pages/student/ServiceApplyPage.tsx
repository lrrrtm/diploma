import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicForm } from "@/components/shared/dynamic-form";
import { FileUpload } from "@/components/shared/file-upload";
import { useStudent } from "@/context/StudentContext";
import api from "@/api/client";
import type { Service } from "@/types";

export default function ServiceApplyPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const student = useStudent();
  const [service, setService] = useState<Service | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<Service>(`/services/${serviceId}`).then((res) => {
      setService(res.data);
      setLoading(false);
    });
  }, [serviceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service || !student) return;

    const missingRequired = service.required_fields
      .filter((f) => f.required && !formValues[f.name]?.trim())
      .map((f) => f.label);

    if (missingRequired.length > 0) {
      toast.error(`Заполните обязательные поля: ${missingRequired.join(", ")}`);
      return;
    }

    if (service.requires_attachment && files.length === 0) {
      toast.error("Необходимо прикрепить документы");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("service_id", String(service.id));
      formData.append("student_external_id", student.student_external_id);
      formData.append("student_name", student.student_name);
      formData.append("student_email", student.student_email);
      formData.append("form_data", JSON.stringify(formValues));
      files.forEach((file) => formData.append("files", file));

      await api.post("/applications/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Заявка отправлена успешно");
      navigate("/applications");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Ошибка при отправке заявки";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !service) {
    return (
      <div className="space-y-6 pt-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-10 w-full rounded-md mt-2" />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Данные студента не получены из приложения</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold leading-tight">{service.name}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {service.required_fields.length > 0 && (
          <DynamicForm
            fields={service.required_fields}
            values={formValues}
            onChange={setFormValues}
          />
        )}

        {service.requires_attachment && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              Прикреплённые документы
              <span className="text-destructive ml-1">*</span>
            </h3>
            <FileUpload files={files} onChange={setFiles} />
          </div>
        )}

        <Button type="submit" className="w-full gap-2" disabled={submitting}>
          <Send className="h-4 w-4" />
          {submitting ? "Отправка..." : "Отправить заявку"}
        </Button>
      </form>
    </div>
  );
}
