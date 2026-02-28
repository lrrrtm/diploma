import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Users } from "lucide-react";
import { goToSSOLogin } from "@/lib/sso";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

interface SessionBrief {
  id: string;
  discipline: string;
  teacher_name: string;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
  tablet_id: string;
}

export default function TeacherHistoryPage() {
  const { isLoggedIn } = useAuth();
  const [sessions, setSessions] = useState<SessionBrief[] | null>(null);

  useEffect(() => {
    if (!isLoggedIn) { goToSSOLogin(); return; }
    api.get<SessionBrief[]>("/sessions/").then((r) => setSessions(r.data)).catch(() => setSessions([]));
  }, [isLoggedIn]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric", month: "long", year: "numeric",
    });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="max-w-lg mx-auto w-full">
        {sessions === null ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Нет прошедших занятий</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Link key={s.id} to={`/teacher/history/${s.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="px-4 py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{s.discipline}</p>
                        {s.is_active && <Badge variant="default" className="shrink-0 bg-green-500 hover:bg-green-500 text-white text-xs">идёт</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(s.started_at)} · {formatTime(s.started_at)}
                        {s.ended_at ? `–${formatTime(s.ended_at)}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}
