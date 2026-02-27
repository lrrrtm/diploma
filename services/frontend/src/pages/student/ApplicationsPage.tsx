import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { useStudent } from "@/context/StudentContext";
import api from "@/api/client";
import type { ApplicationBrief } from "@/types";

const REFRESH_INTERVAL = 5000;

function AppCard({ app, onClick }: { app: ApplicationBrief; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{app.service_name}</span>
              <StatusBadge status={app.status} />
            </div>
            <p className="text-sm text-muted-foreground truncate">{app.department_name}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Clock className="h-3.5 w-3.5" />
            {new Date(app.created_at).toLocaleDateString("ru-RU")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <p className="text-muted-foreground">Заявок нет</p>
    </div>
  );
}

export default function ApplicationsPage() {
  const student = useStudent();
  const [applications, setApplications] = useState<ApplicationBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApplications = () => {
    if (!student) return;
    api
      .get<ApplicationBrief[]>("/applications/", {
        params: { student_external_id: student.student_external_id },
      })
      .then((res) => {
        setApplications(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (!student) {
      setLoading(false);
      return;
    }
    fetchApplications();
    intervalRef.current = setInterval(fetchApplications, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [student]);

  if (!student) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Данные студента не получены из приложения</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const pending = applications.filter((a) => a.status === "pending");
  const inProgress = applications.filter((a) => a.status === "in_progress");
  const done = applications.filter((a) => a.status === "completed" || a.status === "rejected");

  return (
    <div>
      <PageHeader title="Мои заявки" />

      <Tabs defaultValue="pending">
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1">
            Ожидает{pending.length > 0 && <span className="ml-1.5 text-xs opacity-70">({pending.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="flex-1">
            В обработке{inProgress.length > 0 && <span className="ml-1.5 text-xs opacity-70">({inProgress.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1">
            Завершённые{done.length > 0 && <span className="ml-1.5 text-xs opacity-70">({done.length})</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pending.length === 0 ? <EmptyState /> : (
            <div className="space-y-3">
              {pending.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => navigate(`/applications/${app.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="in_progress">
          {inProgress.length === 0 ? <EmptyState /> : (
            <div className="space-y-3">
              {inProgress.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => navigate(`/applications/${app.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="done">
          {done.length === 0 ? <EmptyState /> : (
            <div className="space-y-3">
              {done.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => navigate(`/applications/${app.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
