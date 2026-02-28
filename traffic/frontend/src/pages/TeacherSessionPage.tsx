import { useEffect, useRef, useState } from "react";
import { AlertCircle, Users, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

interface RuzLesson {
  time_start: string;
  time_end: string;
  subject: string;
  teachers: { full_name: string }[];
  typeObj: { abbr: string };
}

interface TabletInfo {
  tablet_id: string;
  building_name: string | null;
  room_name: string | null;
}

export default function TeacherSessionPage() {
  const { isLoggedIn } = useAuth();

  const [session, setSession] = useState<SessionData | null | "none">(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleSuggestions, setScheduleSuggestions] = useState<RuzLesson[]>([]);

  // PIN Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinSearching, setPinSearching] = useState(false);
  const [tabletInfo, setTabletInfo] = useState<TabletInfo | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      goToSSOLogin();
      return;
    }
    // Check if there's already an active session for this teacher
    loadActiveSession();
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadActiveSession() {
    try {
      // List sessions — if there's an active one, load it
      const res = await api.get<SessionData[]>("/sessions/");
      const active = res.data.find((s) => s.is_active);
      if (active) {
        setSession(active);
        loadScheduleSuggestions(active.tablet_id);
      } else {
        setSession("none");
      }
    } catch {
      setSession("none");
    }
  }

  async function loadScheduleSuggestions(tabletId: string) {
    try {
      const tabletRes = await api.get<{
        building_id: number | null;
        room_id: number | null;
      }>(`/tablets/${tabletId}`);
      const { building_id, room_id } = tabletRes.data;
      if (!building_id || !room_id) return;

      const today = new Date().toISOString().split("T")[0];
      const schedRes = await api.get(
        `/schedule/buildings/${building_id}/rooms/${room_id}/scheduler?date=${today}`,
      );
      const todayWeekday = new Date().getDay() || 7;
      const day = schedRes.data.days?.find((d: { weekday: number }) => d.weekday === todayWeekday);
      const lessons: RuzLesson[] = day?.lessons ?? [];

      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      const withMinutes = lessons.map((l) => {
        const [h, m] = l.time_start.split(":").map(Number);
        return { lesson: l, startMin: h * 60 + m };
      });
      const current = withMinutes.find(({ lesson, startMin }) => {
        const [eh, em] = lesson.time_end.split(":").map(Number);
        return startMin <= nowMinutes && nowMinutes <= eh * 60 + em;
      });
      if (current) setDiscipline(current.lesson.subject);
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

  // PIN completed — look up tablet
  async function handlePinComplete(value: string) {
    if (value.length !== 6) return;
    setPinSearching(true);
    try {
      const res = await api.get<TabletInfo>(`/tablets/by-display-pin?pin=${value}`);
      setTabletInfo(res.data);
      await loadScheduleSuggestions(res.data.tablet_id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Киоск с таким кодом не найден");
      setPin("");
    } finally {
      setPinSearching(false);
    }
  }

  const handleStart = async () => {
    if (!discipline.trim()) { setError("Введите название дисциплины"); return; }
    if (!tabletInfo) { setError("Выберите киоск (введите код)"); return; }
    setError(null);
    setStarting(true);
    try {
      const res = await api.post<SessionData>("/sessions/", {
        tablet_id: tabletInfo.tablet_id,
        discipline: discipline.trim(),
      });
      setSession(res.data);
      setAttendees([]);
      setSheetOpen(false);
      setTabletInfo(null);
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
      setDiscipline("");
      setTabletInfo(null);
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
    <div className="max-w-lg mx-auto w-full">
      {session === "none" ? (
        /* ── No active session ── */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Текущая сессия</h2>
            <Button size="sm" onClick={() => { setTabletInfo(null); setPin(""); setSheetOpen(true); }}>
              Начать занятие
            </Button>
          </div>
          <p className="text-sm text-muted-foreground py-8 text-center">
            Нет активного занятия. Нажмите «Начать занятие» и введите код с экрана киоска.
          </p>
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
        </div>
      )}

      {/* ── Start session Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) { setPin(""); setTabletInfo(null); setError(null); } }}>
        <SheetContent side="bottom" className="rounded-t-xl max-h-[90vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Начать занятие</SheetTitle>
            <SheetDescription>
              Введите 6-значный код с экрана киоска, затем укажите дисциплину
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 pb-4">
            {/* Step 1: PIN */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Код киоска</p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={pin}
                  onChange={setPin}
                  onComplete={handlePinComplete}
                  disabled={pinSearching}
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
                <p className="text-xs text-muted-foreground text-center">Поиск киоска...</p>
              )}
              {tabletInfo && (
                <p className="text-sm text-center text-green-600 dark:text-green-400 font-medium">
                  Аудитория: {tabletInfo.building_name}, ауд. {tabletInfo.room_name}
                </p>
              )}
            </div>

            {/* Step 2: Discipline (shown after tablet found) */}
            {tabletInfo && (
              <>
                {scheduleSuggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Расписание — выберите дисциплину:</p>
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
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
