import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ResponsesList } from "@/components/shared/responses-list";
import { useStudent } from "@/context/StudentContext";
import api from "@/api/client";
import { downloadAttachment } from "@/lib/attachments";
import type { ApplicationDetail } from "@/types";

const detailCache: Record<string, ApplicationDetail> = {};

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const student = useStudent();
  const cached = id ? detailCache[id] : undefined;
  const [application, setApplication] = useState<ApplicationDetail | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const handleDownload = async (attachmentId: string, filename: string) => {
    try {
      await downloadAttachment(attachmentId, filename);
    } catch {
      // noop: local page doesn't use toaster
    }
  };

  useEffect(() => {
    if (!student || !id) return;
    if (detailCache[id]) return;
    api
      .get<ApplicationDetail>(`/applications/${id}`)
      .then((res) => {
        detailCache[id] = res.data;
        setApplication(res.data);
        setLoading(false);
      });
  }, [id, student]);

  if (!student) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Данные студента не получены из приложения</p>
      </div>
    );
  }

  if (loading || !application) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pt-6">
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
    <div className="max-w-3xl mx-auto pt-6">
      <PageHeader
        title={`Заявка #${application.id}`}
        backTo="/applications"
        actions={<StatusBadge status={application.status} />}
      />

      <div className="space-y-6">
        {/* Service info */}
        <Card>
          <CardHeader>
            <CardTitle>{application.service_name}</CardTitle>
            <CardDescription>{application.department_name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Подана: {new Date(application.created_at).toLocaleString("ru-RU")}
            </div>

            {/* Form data */}
            {Object.keys(application.form_data).length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Данные заявки</h3>
                  <div className="grid gap-2">
                    {Object.entries(application.form_data).map(
                      ([key, value]) => {
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
                      }
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Attachments */}
            {application.attachments.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Прикрепленные файлы</h3>
                  <div className="space-y-1">
                    {application.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => handleDownload(att.id, att.filename)}
                        className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm hover:bg-secondary/80 transition-colors"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                        {att.filename}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ResponsesList responses={application.responses} title="Ответы" />
      </div>
    </div>
  );
}
