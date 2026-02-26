import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, MessageSquare, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import api from "@/api/client";
import type { ApplicationDetail } from "@/types";

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApplicationDetail>(`/applications/${id}`).then((res) => {
      setApplication(res.data);
      setLoading(false);
    });
  }, [id]);

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
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between p-2 bg-secondary rounded-md text-sm"
                        >
                          <span className="text-muted-foreground">{key}</span>
                          <span className="font-medium">{value}</span>
                        </div>
                      )
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

        {/* Responses */}
        {application.responses.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Ответы ({application.responses.length})
            </h2>
            {application.responses.map((resp) => (
              <Card key={resp.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{resp.staff_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(resp.created_at).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{resp.message}</p>
                  {resp.attachments.length > 0 && (
                    <div className="space-y-1">
                      {resp.attachments.map((att) => (
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
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
