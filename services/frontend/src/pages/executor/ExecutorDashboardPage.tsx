import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Clock, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
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
            <p className="text-sm text-muted-foreground truncate">{app.student_name}</p>
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

export default function ExecutorDashboardPage() {
  const [applications, setApplications] = useState<ApplicationBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApplications = () => {
    api
      .get<ApplicationBrief[]>("/applications/")
      .then((res) => {
        setApplications(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchApplications();
    intervalRef.current = setInterval(fetchApplications, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter((a) =>
      (a.student_name ?? "").toLowerCase().includes(q) ||
      (a.service_name ?? "").toLowerCase().includes(q)
    );
  }, [applications, search]);

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
                  <Skeleton className="h-4 w-2/5" />
                </div>
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const pending = filtered.filter((a) => a.status === "pending");
  const inProgress = filtered.filter((a) => a.status === "in_progress");
  const done = filtered.filter((a) => a.status === "completed" || a.status === "rejected");

  return (
    <div>
      <PageHeader title="Мои заявки" />

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Поиск по студенту или услуге..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch("")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

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
                <AppCard key={app.id} app={app} onClick={() => navigate(`/executor/applications/${app.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="in_progress">
          {inProgress.length === 0 ? <EmptyState /> : (
            <div className="space-y-3">
              {inProgress.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => navigate(`/executor/applications/${app.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="done">
          {done.length === 0 ? <EmptyState /> : (
            <div className="space-y-3">
              {done.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => navigate(`/executor/applications/${app.id}`)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
