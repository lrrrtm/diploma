import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, LogOut, Users, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";

interface Attendee {
  student_external_id: string;
  student_name: string;
  student_email: string;
  marked_at: string;
}

interface CurrentSession {
  active: boolean;
  session_id?: string;
  discipline?: string;
}

export default function TeacherSessionPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("teacher_token");
  const teacherName = localStorage.getItem("teacher_name") ?? "Преподаватель";

  const [session, setSession] = useState<CurrentSession | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Redirect to login if no token
  useEffect(() => {
    if (!token) navigate("/teacher/login");
  }, [token, navigate]);

  // Load current session on mount
  useEffect(() => {
    api.get<CurrentSession>("/sessions/current").then((res) => {
      setSession(res.data);
      if (res.data.active && res.data.session_id) {
        sessionIdRef.current = res.data.session_id;
      }
    });
  }, []);

  // Poll attendees while session is active
  useEffect(() => {
    if (!session?.active || !session.session_id) return;
    sessionIdRef.current = session.session_id;

    const fetchAttendees = () => {
      api
        .get<Attendee[]>(`/sessions/${session.session_id}/attendees`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => setAttendees(res.data))
        .catch(() => {});
    };

    fetchAttendees();
    const interval = setInterval(fetchAttendees, 5000);
    return () => clearInterval(interval);
  }, [session?.active, session?.session_id, token]);

  const handleStart = async () => {
    if (!discipline.trim()) { setError("Введите название дисциплины"); return; }
    setError(null);
    setStarting(true);
    try {
      const res = await api.post(
        "/sessions/",
        { discipline: discipline.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSession({ active: true, session_id: res.data.id, discipline: res.data.discipline });
      setAttendees([]);
    } catch {
      setError("Не удалось создать занятие");
    } finally {
      setStarting(false);
    }
  };

  const handleClose = async () => {
    const id = session?.session_id;
    if (!id) return;
    await api.delete(`/sessions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSession({ active: false });
    setAttendees([]);
    sessionIdRef.current = null;
  };

  const handleLogout = () => {
    localStorage.removeItem("teacher_token");
    localStorage.removeItem("teacher_name");
    navigate("/teacher/login");
  };

  if (!session) {
    return (
      <div className="h-full overflow-hidden flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="font-semibold text-foreground text-sm">Посещаемость</p>
          <p className="text-xs text-muted-foreground">{teacherName}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {!session.active ? (
          /* ── No active session — create one ── */
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Новое занятие</h2>
            <div className="space-y-1.5">
              <Label htmlFor="discipline">Название дисциплины</Label>
              <Input
                id="discipline"
                type="text"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="Например: Математический анализ"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleStart} disabled={starting} className="w-full">
              {starting ? "Запуск..." : "Начать занятие"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              После запуска на экране аудитории появится QR-код для студентов
            </p>
          </div>
        ) : (
          /* ── Active session ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">{session.discipline}</h2>
                <p className="text-sm text-muted-foreground">Занятие идёт</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Завершить
              </Button>
            </div>

            {/* Attendee count */}
            <Card>
              <CardContent className="px-4 py-3 flex items-center gap-3">
                <Users className="h-5 w-5 text-primary shrink-0" />
                <p className="text-sm font-medium text-foreground">
                  Присутствует: <span className="text-primary">{attendees.length}</span>
                </p>
              </CardContent>
            </Card>

            {/* Attendee list */}
            {attendees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Студенты ещё не отметились
              </p>
            ) : (
              <div className="space-y-2">
                {attendees.map((a) => (
                  <Card key={a.student_external_id}>
                    <CardContent className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.student_name}</p>
                        <p className="text-xs text-muted-foreground">{a.student_email}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.marked_at).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
