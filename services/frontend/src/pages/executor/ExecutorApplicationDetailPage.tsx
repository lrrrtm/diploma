import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, User } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ResponsesList } from "@/components/shared/responses-list";
import { RespondForm } from "@/components/shared/respond-form";
import api from "@/api/client";
import type { ApplicationDetail } from "@/types";

export default function ExecutorApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchApplication = () => {
    api.get<ApplicationDetail>(`/applications/${id}`).then((res) => {
      setApplication(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchApplication();
  }, [id]);

  const handleRespondSubmit = async (message: string, newStatus: string, files: File[]) => {
    try {
      const formData = new FormData();
      formData.append("message", message);
      if (newStatus) formData.append("new_status", newStatus);
      files.forEach((file) => formData.append("files", file));
      await api.post(`/applications/${id}/respond`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Ответ отправлен");
      fetchApplication();
    } catch (err) {
      toast.error("Не удалось отправить ответ");
      throw err;
    }
  };

  if (loading || !application) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={`Заявка`}
        backTo="/executor"
        actions={<StatusBadge status={application.status} />}
      />

      <div className="space-y-6">
        {/* Application info */}
        <Card>
          <CardHeader>
            <CardTitle>{application.service_name}</CardTitle>
            <CardDescription>
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {application.student_name} | Подана:{" "}
                {new Date(application.created_at).toLocaleString("ru-RU")}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.keys(application.form_data).length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Данные заявки</h3>
                <div className="grid gap-2">
                  {Object.entries(application.form_data).map(([key, value]) => {
                    const fieldDef = application.service_fields.find((f) => f.name === key);
                    const label = fieldDef?.label ?? key;
                    return (
                      <div key={key} className="flex justify-between p-2 bg-secondary rounded-md text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {application.attachments.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Документы от студента</h3>
                  <div className="space-y-1">
                    {application.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/uploads/${att.file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm hover:bg-secondary/80 transition-colors"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                        {att.filename}
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ResponsesList responses={application.responses} />

        <RespondForm onSubmit={handleRespondSubmit} />
      </div>
    </div>
  );
}
