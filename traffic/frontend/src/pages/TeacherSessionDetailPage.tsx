import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { goToSSOLogin } from "@/lib/sso";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

interface SessionData {
  id: string;
  discipline: string;
  teacher_name: string;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
}

interface Attendee {
  id: string;
  student_name: string;
  student_email: string;
  marked_at: string;
}

export default function TeacherSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [session, setSession] = useState<SessionData | null>(null);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);

  useEffect(() => {
    if (!isLoggedIn) { goToSSOLogin(); return; }
    if (!sessionId) return;
    api.get<SessionData>(`/sessions/${sessionId}`).then((r) => setSession(r.data)).catch(() => navigate(-1));
    api.get<Attendee[]>(`/sessions/${sessionId}/attendees`).then((r) => setAttendees(r.data)).catch(() => setAttendees([]));
  }, [isLoggedIn, sessionId, navigate]);

  function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="max-w-lg mx-auto w-full space-y-4">
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold truncate">{session?.discipline ?? "..."}</h1>
          {session?.is_active && (
            <Badge className="shrink-0 bg-green-500 hover:bg-green-500 text-white text-xs">идёт</Badge>
          )}
        </div>
        {session && (
          <p className="text-sm text-muted-foreground">
            {new Date(session.started_at).toLocaleDateString("ru-RU", {
              day: "numeric", month: "long",
            })} · {fmt(session.started_at)}
            {session.ended_at ? `–${fmt(session.ended_at)}` : ""}
          </p>
        )}
      </div>
        {attendees === null ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : attendees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Никто не отметился</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              Отмечено: {attendees.length}
            </p>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Студент</TableHead>
                    <TableHead className="text-right w-20">Время</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendees.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{a.student_name}</p>
                        <p className="text-xs text-muted-foreground">{a.student_email}</p>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {fmt(a.marked_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
    </div>
  );
}
