import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, User, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ResponsesList } from "@/components/shared/responses-list";
import { RespondForm } from "@/components/shared/respond-form";
import { useAuth } from "@/context/AuthContext";
import api from "@/api/client";
import type { ApplicationDetail, Executor } from "@/types";

export default function StaffApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { auth } = useAuth();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [selectedExecutorId, setSelectedExecutorId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  const fetchApplication = () => {
    api.get<ApplicationDetail>(`/applications/${id}`).then((res) => {
      setApplication(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchApplication();
  }, [id]);

  useEffect(() => {
    if (auth?.role === "staff") {
      api.get<Executor[]>("/executors/").then((res) => setExecutors(res.data));
    }
  }, [auth]);

  // Sync select with current application executor
  useEffect(() => {
    if (application) {
      setSelectedExecutorId(application.executor_id ?? "");
    }
  }, [application]);

  const handleAssign = async () => {
    setAssigning(true);
    try {
      await api.patch(`/applications/${id}/assign`, {
        executor_id: selectedExecutorId || null,
      });
      toast.success(selectedExecutorId ? "Исполнитель назначен" : "Назначение снято");
      fetchApplication();
    } catch {
      toast.error("Не удалось назначить исполнителя");
    } finally {
      setAssigning(false);
    }
  };

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
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-1/4" />
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={`Заявка #${application.id}`}
        backTo="/staff"
        actions={<StatusBadge status={application.status} />}
      />

      <div className="space-y-6">
        {/* Assign executor — staff only */}
        {auth?.role === "staff" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Исполнитель
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 items-center">
                <Select
                  value={selectedExecutorId}
                  onChange={(e) => setSelectedExecutorId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">— Не назначен</option>
                  {executors.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  onClick={handleAssign}
                  disabled={assigning}
                >
                  {assigning ? "..." : "Назначить"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
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
            {/* Form data */}
            {Object.keys(application.form_data).length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Данные заявки</h3>
                <div className="grid gap-2">
                  {Object.entries(application.form_data).map(([key, value]) => {
                    const fieldDef = application.service_fields.find((f) => f.name === key);
                    const label = fieldDef?.label ?? key;
                    return (
                      <div
                        key={key}
                        className="flex justify-between p-2 bg-secondary rounded-md text-sm"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attachments */}
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
