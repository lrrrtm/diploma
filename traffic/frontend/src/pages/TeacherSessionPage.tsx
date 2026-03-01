import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Users, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
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

interface TabletInfo {
  tablet_id: string;
  building_name: string | null;
  room_name: string | null;
}

interface SessionStartLesson {
  subject: string;
  time_start: string;
  time_end: string;
  type_abbr: string;
}

interface SessionStartOptions {
  tablet: TabletInfo;
  lessons: SessionStartLesson[];
}

function pickSuggestedLessonIndex(lessons: SessionStartLesson[]): number {
  if (lessons.length === 0) return -1;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const index = lessons.findIndex((lesson) => {
    const [sh, sm] = lesson.time_start.split(":").map(Number);
    const [eh, em] = lesson.time_end.split(":").map(Number);
    if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
      return false;
    }
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return nowMinutes >= start && nowMinutes <= end;
  });
  return index >= 0 ? index : 0;
}

export default function TeacherSessionPage() {
  const { isLoggedIn } = useAuth();

  const [session, setSession] = useState<SessionData | null | "none">(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  const [pin, setPin] = useState("");
  const [pinSearching, setPinSearching] = useState(false);
  const [tabletInfo, setTabletInfo] = useState<TabletInfo | null>(null);
  const [availableLessons, setAvailableLessons] = useState<SessionStartLesson[]>([]);
  const [selectedLessonIndex, setSelectedLessonIndex] = useState<number | null>(null);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      goToSSOLogin();
      return;
    }
    loadActiveSession();
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadActiveSession() {
    try {
      const res = await api.get<SessionData[]>("/sessions/");
      const active = res.data.find((s) => s.is_active);
      if (active) {
        setSession(active);
      } else {
        setSession("none");
      }
    } catch {
      setSession("none");
    }
  }

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
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session]);

  async function handlePinComplete(value: string) {
    if (value.length !== 6) return;
    setPinSearching(true);
    setError(null);

    try {
      const res = await api.get<SessionStartOptions>(`/sessions/start-options?pin=${encodeURIComponent(value)}`);
      setTabletInfo(res.data.tablet);
      setAvailableLessons(res.data.lessons);

      if (res.data.lessons.length === 0) {
        setSelectedLessonIndex(null);
        setError("В этой аудитории у вас нет занятий на сегодня. Начать сессию нельзя.");
      } else {
        const suggested = pickSuggestedLessonIndex(res.data.lessons);
        setSelectedLessonIndex(suggested);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Не удалось проверить код киоска");
      setTabletInfo(null);
      setAvailableLessons([]);
      setSelectedLessonIndex(null);
      setPin("");
    } finally {
      setPinSearching(false);
    }
  }

  const selectedLesson = useMemo(() => {
    if (selectedLessonIndex === null) return null;
    return availableLessons[selectedLessonIndex] ?? null;
  }, [availableLessons, selectedLessonIndex]);

  const canStart = !!tabletInfo && !!selectedLesson && !starting;

  const handleStart = async () => {
    if (!tabletInfo || !selectedLesson) {
      setError("Выберите занятие из расписания");
      return;
    }

    setError(null);
    setStarting(true);
    try {
      const res = await api.post<SessionData>("/sessions/", {
        tablet_id: tabletInfo.tablet_id,
        discipline: selectedLesson.subject,
        schedule_snapshot: JSON.stringify(selectedLesson),
      });
      setSession(res.data);
      setAttendees([]);
      setTabletInfo(null);
      setAvailableLessons([]);
      setSelectedLessonIndex(null);
      setPin("");
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
      setTabletInfo(null);
      setAvailableLessons([]);
      setSelectedLessonIndex(null);
      setPin("");
      setError(null);
      toast.success("Занятие завершено");
    } catch {
      toast.error("Не удалось завершить занятие");
    }
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
    <div className="max-w-2xl mx-auto w-full">
      {session === "none" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Сессия</h2>

          <div className="min-h-[64vh] flex flex-col items-center justify-center gap-6">
            <div className="w-full max-w-md space-y-3">
              <p className="text-sm font-medium text-center">Введите код киоска</p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={pin}
                  onChange={(value) => {
                    setPin(value);
                    if (error) setError(null);
                  }}
                  onComplete={handlePinComplete}
                  disabled={pinSearching || starting}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {pinSearching && (
                <p className="text-xs text-muted-foreground text-center">Проверяем код киоска...</p>
              )}
              {tabletInfo && (
                <p className="text-sm text-center text-green-600 dark:text-green-400 font-medium">
                  Аудитория: {tabletInfo.building_name}, ауд. {tabletInfo.room_name}
                </p>
              )}
            </div>

            {tabletInfo && availableLessons.length > 0 && (
              <div className="w-full max-w-md space-y-3">
                <p className="text-sm font-medium">Выберите занятие</p>
                <div className="space-y-2">
                  {availableLessons.map((lesson, index) => (
                    <Button
                      key={`${lesson.time_start}-${lesson.time_end}-${lesson.subject}-${index}`}
                      variant={selectedLessonIndex === index ? "default" : "outline"}
                      className="w-full h-auto py-2.5 justify-start text-left"
                      onClick={() => setSelectedLessonIndex(index)}
                    >
                      <span className="font-mono text-xs shrink-0">{lesson.time_start}-{lesson.time_end}</span>
                      <span className="mx-2 truncate">{lesson.subject}</span>
                      <span className="text-xs opacity-80 shrink-0">{lesson.type_abbr}</span>
                    </Button>
                  ))}
                </div>
                <Button className="w-full" onClick={handleStart} disabled={!canStart}>
                  {starting ? "Запуск..." : "Начать занятие"}
                </Button>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="w-full max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Сессия</h2>

          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold">{session.discipline}</h3>
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
        </div>
      )}
    </div>
  );
}
