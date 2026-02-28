import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { AlertCircle, ClipboardList, LogOut, Users, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { goToSSOLogin } from "@/lib/sso";
import { toast } from "sonner";

interface Attendee {
  id: string;
  student_external_id: string;
  student_name: string;
  student_email: string;
  marked_at: string;
}

interface SessionData {
  id: string;
  discipline: string;
  teacher_name: string;
  is_active: boolean;
  tablet_id: string;
}

interface RuzLesson {
  time_start: string;
  time_end: string;
  subject: string;
  teachers: { full_name: string }[];
  typeObj: { abbr: string };
}

export default function TeacherSessionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { teacherName, logout, isLoggedIn } = useAuth();

  const deviceId = params.get("device") ?? "";

  const [session, setSession] = useState<SessionData | null | "none">(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleSuggestions, setScheduleSuggestions] = useState<RuzLesson[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      goToSSOLogin();
    }
  }, [isLoggedIn, navigate]);

  // Load current session for this device
  useEffect(() => {
    if (!deviceId) return;
    api
      .get<{ active: boolean; session_id?: string }>(`/sessions/current?device_id=${deviceId}`)
      .then((res) => {
        if (res.data.active && res.data.session_id) {
          loadSession(res.data.session_id);
        } else {
          setSession("none");
          loadScheduleSuggestions();
        }
      })
      .catch(() => setSession("none"));
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSession(sessionId: string) {
    try {
      const res = await api.get<SessionData>(`/sessions/${sessionId}`);
      setSession(res.data);
    } catch {
      setSession("none");
    }
  }

  // Fetch schedule suggestions for discipline autofill
  async function loadScheduleSuggestions() {
    if (!deviceId) return;
    try {
      // Get tablet info to find building_id/room_id
      const tabletRes = await api.get<{
        building_id: number | null;
        room_id: number | null;
      }>(`/tablets/${deviceId}`);
      const { building_id, room_id } = tabletRes.data;
      if (!building_id || !room_id) return;

      const today = new Date().toISOString().split("T")[0];
      const schedRes = await api.get(
        `/schedule/buildings/${building_id}/rooms/${room_id}/scheduler?date=${today}`,
      );
      const todayWeekday = new Date().getDay() || 7;
      const day = schedRes.data.days?.find((d: { weekday: number }) => d.weekday === todayWeekday);
      const lessons: RuzLesson[] = day?.lessons ?? [];

      // Find current or next lesson by time
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      const withMinutes = lessons.map((l) => {
        const [h, m] = l.time_start.split(":").map(Number);
        return { lesson: l, startMin: h * 60 + m };
      });
      // Current: started but not yet ended; or next upcoming
      const current = withMinutes.find(({ lesson, startMin }) => {
        const [eh, em] = lesson.time_end.split(":").map(Number);
        return startMin <= nowMinutes && nowMinutes <= eh * 60 + em;
      });
      if (current) {
        setDiscipline(current.lesson.subject);
      }
      setScheduleSuggestions(lessons);
    } catch {
      // schedule not critical
    }
  }

  // Poll attendees while session is active
  useEffect(() => {
    if (!session || session === "none") return;
    const fetchAttendees = () => {
      api
        .get<Attendee[]>(`/sessions/${session.id}/attendees`)
        .then((res) => setAttendees(res.data))
        .catch(() => {});
    };
    fetchAttendees();
    pollRef.current = setInterval(fetchAttendees, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session]);

  const handleStart = async () => {
    if (!discipline.trim()) { setError("Введите название дисциплины"); return; }
    if (!deviceId) { setError("Не указан планшет (device= в URL)"); return; }
    setError(null);
    setStarting(true);
    try {
      const res = await api.post<SessionData>("/sessions/", {
        tablet_id: deviceId,
        discipline: discipline.trim(),
      });
      setSession(res.data);
      setAttendees([]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Не удалось создать занятие");
    } finally {
      setStarting(false);
    }
  };

  const handleClose = async () => {
    if (!session || session === "none") return;
    try {
      await api.delete(`/sessions/${session.id}`);
      setSession("none");
      setAttendees([]);
      setDiscipline("");
      toast.success("Занятие завершено");
      loadScheduleSuggestions();
    } catch {
      toast.error("Не удалось завершить занятие");
    }
  };

  const handleLogout = () => {
    logout();
    goToSSOLogin();
  };

  if (session === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-10 w-full max-w-sm" />
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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/teacher/history"><ClipboardList className="h-4 w-4" /></Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {session === "none" ? (
          /* ── No active session ── */
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Новое занятие</h2>

            {scheduleSuggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Расписание на сегодня — выберите дисциплину:</p>
                <div className="flex flex-col gap-1">
                  {scheduleSuggestions.map((l, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      onClick={() => setDiscipline(l.subject)}
                      className="justify-start h-auto py-2 font-normal"
                    >
                      <span className="text-muted-foreground font-mono shrink-0">{l.time_start}</span>
                      <span className="font-medium mx-2 truncate">{l.subject}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{l.typeObj?.abbr}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="discipline">Дисциплина</Label>
              <Input
                id="discipline"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="Название дисциплины"
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
          </div>
        ) : (
          /* ── Active session ── */
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{session.discipline}</h2>
                <p className="text-sm text-muted-foreground">Занятие идёт</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive shrink-0"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Завершить
              </Button>
            </div>

            <Card>
              <CardContent className="px-4 py-3 flex items-center gap-3">
                <Users className="h-5 w-5 text-primary shrink-0" />
                <p className="text-sm font-medium">
                  Присутствует: <span className="text-primary">{attendees.length}</span>
                </p>
              </CardContent>
            </Card>

            {attendees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Студенты ещё не отметились
              </p>
            ) : (
              <div className="space-y-2">
                {attendees.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{a.student_name}</p>
                        <p className="text-xs text-muted-foreground">{a.student_email}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.marked_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
