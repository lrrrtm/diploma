import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import api from "@/api/client";
import type { ApplicationBrief } from "@/types";

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<ApplicationBrief[]>("/applications/").then((res) => {
      setApplications(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Мои заявки" description="Список поданных заявок" />

      {applications.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Заявок пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card
              key={app.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/applications/${app.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{app.service_name}</span>
                      <StatusBadge status={app.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {app.department_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {new Date(app.created_at).toLocaleDateString("ru-RU")}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
