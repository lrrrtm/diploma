import { useEffect, useRef, useState } from "react";
import { Pi, CalendarDays, BookOpen, FileText, User, QrCode, ChevronLeft, ChevronRight, Sun, Moon, Monitor, ChevronsUpDown, Check, AlertCircle, ClipboardList, Star, GraduationCap, Clock, Layers } from "lucide-react";
import { fetchMe, fetchMiniApps, fetchLaunchToken, fetchResolveGroup, fetchSchedule, fetchGradebook } from "./api";
import type { MiniApp, Student, WeekSchedule, DaySchedule, GradeEntry, GradebookResponse } from "./types";
import LoginPage from "./DevLoginPage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ru } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "./context/ThemeContext";

// ---------------------------------------------------------------------------
// Bottom navbar
// ---------------------------------------------------------------------------

type Tab = "home" | "schedule" | "gradebook" | "services" | "profile";

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home",      label: "Главная",    icon: Pi         },
  { id: "schedule",  label: "Расписание", icon: CalendarDays },
  { id: "gradebook", label: "Зачётка",    icon: BookOpen     },
  { id: "services",  label: "Услуги",     icon: FileText     },
];

function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40">
      <div className="max-w-2xl mx-auto flex">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <Button
              key={id}
              variant="ghost"
              onClick={() => onChange(id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 px-0 text-xs h-auto rounded-none whitespace-normal [&_svg]:size-5"
              style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Services sheet — slides up over the whole screen
// ---------------------------------------------------------------------------

function ServicesSheet({
  app,
  open,
  onClose,
}: {
  app: MiniApp | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || !app) return;
    setLoaded(false);
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchLaunchToken(token).then((launchToken) => {
      setHref(`${app.url}?launch_token=${encodeURIComponent(launchToken)}`);
    });
  }, [open, app]);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="h-[100dvh] p-0 gap-0 flex flex-col rounded-none">
        <SheetTitle className="sr-only">Услуги</SheetTitle>
        <div className="relative flex-1 min-h-0">
          {href && (
            <iframe
              src={href}
              className="absolute inset-0 w-full h-full border-0"
              title="Заявки"
              onLoad={() => setLoaded(true)}
            />
          )}
          {!loaded && (
            <div className="absolute inset-0 bg-background z-10 flex flex-col p-4 gap-3">
              {app ? (
                <>
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-8 w-2/3 rounded-xl" />
                  <div className="space-y-3 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Сервис недоступен
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Traffic sheet — camera scanner iframe for attendance
// ---------------------------------------------------------------------------

function TrafficSheet({
  app,
  open,
  onClose,
}: {
  app: MiniApp | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || !app) return;
    setLoaded(false);
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchLaunchToken(token).then((launchToken) => {
      setHref(`${app.url}/scan?launch_token=${encodeURIComponent(launchToken)}`);
    });
  }, [open, app]);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="h-[100dvh] p-0 gap-0 flex flex-col rounded-none">
        <SheetTitle className="sr-only">Посещаемость</SheetTitle>
        <div className="relative flex-1 min-h-0">
          {href && (
            <iframe
              src={href}
              allow="camera"
              className="absolute inset-0 w-full h-full border-0"
              title="Посещаемость"
              onLoad={() => setLoaded(true)}
            />
          )}
          {!loaded && (
            <div className="absolute inset-0 bg-background z-10 flex flex-col p-4 gap-3">
              {app ? (
                <>
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-8 w-2/3 rounded-xl" />
                  <div className="space-y-3 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Сервис недоступен
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Mini-app card (Home tab)
// ---------------------------------------------------------------------------

function MiniAppCard({ app }: { app: MiniApp }) {
  const handleClick = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const launchToken = await fetchLaunchToken(token);
      window.open(`${app.url}?launch_token=${encodeURIComponent(launchToken)}`, "_blank");
    } catch {
      // silently ignore — user can tap again
    }
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200"
      onClick={handleClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{app.name}</p>
            {app.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{app.description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Schedule tab
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatDateFull(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function LessonCard({ lesson, isNow = false }: { lesson: DaySchedule["lessons"][number]; isNow?: boolean }) {
  const loc = lesson.auditories
    .map((a) => {
      const aud = a.name ? `ауд. ${a.name}` : "";
      return [aud, a.building].filter(Boolean).join(", ");
    })
    .join(" / ");
  const teacher = lesson.teachers.map((t) => t.full_name).join(", ");

  return (
    <Card>
      <CardContent className="p-4 flex gap-3">
        <div className="flex flex-col items-center justify-center text-center w-14 shrink-0 gap-0.5">
          {isNow && (
            <span className="relative flex h-2.5 w-2.5 mb-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
          <span className="text-base font-bold">{lesson.time_start}</span>
          <span className="text-base text-muted-foreground">{lesson.time_end}</span>
        </div>
        <Separator orientation="vertical" className="shrink-0 self-stretch h-auto" />
        <div className="min-w-0 flex-1">
          <Badge variant="secondary" className="mb-1.5">{lesson.type_name}</Badge>
          <p className="text-base font-semibold leading-tight">{lesson.subject}</p>
          {teacher && <p className="text-sm text-muted-foreground mt-1.5">{teacher}</p>}
          {loc && <p className="text-sm text-muted-foreground mt-0.5">{loc}</p>}
          {lesson.additional_info && (
            <p className="text-sm text-muted-foreground mt-0.5 italic">{lesson.additional_info}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleTab({ student }: { student: Student }) {
  const [groupId, setGroupId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState<number>(0);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [slideDir, setSlideDir] = useState<"from-right" | "from-left">("from-right");
  const [slideKey, setSlideKey] = useState(0);
  const resolvedGroupId = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const pendingDayIdx = useRef<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setCalendarOpen(false);
    const day = date.getDay();
    const dayIdx = Math.min(5, day === 0 ? 0 : day - 1);
    const todayMonday = getMondayOf(new Date());
    const pickedMonday = getMondayOf(date);
    const newOffset = Math.round(
      (pickedMonday.getTime() - todayMonday.getTime()) / (7 * 86400000)
    );
    if (newOffset === weekOffset) {
      goToDay(dayIdx, dayIdx > activeDayIdx ? "from-right" : "from-left");
      return;
    }
    pendingDayIdx.current = dayIdx;
    setSlideDir(newOffset > weekOffset ? "from-right" : "from-left");
    setSlideKey((k) => k + 1);
    setWeekOffset(newOffset);
  };

  const goToDay = (idx: number, dir: "from-right" | "from-left") => {
    setSlideDir(dir);
    setSlideKey((k) => k + 1);
    setActiveDayIdx(idx);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) {
      // swipe left → next day
      if (activeDayIdx < 5) { goToDay(activeDayIdx + 1, "from-right"); }
      else { setSlideDir("from-right"); setSlideKey((k) => k + 1); setWeekOffset((o) => o + 1); }
    } else {
      // swipe right → prev day
      if (activeDayIdx > 0) { goToDay(activeDayIdx - 1, "from-left"); }
      else { pendingDayIdx.current = 5; setSlideDir("from-left"); setSlideKey((k) => k + 1); setWeekOffset((o) => o - 1); }
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let gid = resolvedGroupId.current;
        if (!gid) {
          if (!student.faculty_abbr || !student.study_group_str) {
            setError("Группа не определена в профиле");
            setLoading(false);
            return;
          }
          const resolved = await fetchResolveGroup(token, student.faculty_abbr, student.study_group_str);
          gid = resolved.group_id;
          resolvedGroupId.current = gid;
          setGroupId(gid);
        }
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + weekOffset * 7);
        const dateStr = baseDate.toISOString().slice(0, 10);
        const data = await fetchSchedule(token, gid, dateStr);
        setSchedule(data);
        // Auto-select pending date (from calendar pick), today, or first day
        if (pendingDayIdx.current !== null) {
          setActiveDayIdx(pendingDayIdx.current);
          pendingDayIdx.current = null;
        } else if (weekOffset === 0) {
          const todayIso = new Date().toISOString().slice(0, 10);
          const weekStartDate = new Date(data.week.date_start);
          const todayDate = new Date(todayIso);
          const diff = Math.round((todayDate.getTime() - weekStartDate.getTime()) / 86400000);
          setActiveDayIdx(diff >= 0 && diff < 6 ? diff : 0);
        } else {
          setActiveDayIdx(0);
        }
      } catch (e: unknown) {
        setError((e as Error).message ?? "Ошибка загрузки расписания");
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  if (loading && !schedule) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !schedule) {
    const isStaleToken = !student.faculty_abbr || !student.study_group_str;
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6 gap-4">
        <p className="text-muted-foreground text-sm">
          {isStaleToken
            ? "Для загрузки расписания необходимо войти заново"
            : (error ?? "Расписание недоступно")}
        </p>
        {isStaleToken && (
          <Button
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
          >
            Войти заново
          </Button>
        )}
      </div>
    );
  }

  const days = schedule.days;
  // Build a fixed Mon–Sat grid aligned to the week returned by the API
  const weekStart = schedule.week.date_start; // YYYY-MM-DD (Monday)
  const fixedDays = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return days.find((day) => day.date === iso) ?? { weekday: i + 1, date: iso, lessons: [] };
  });
  const activeDay = fixedDays[activeDayIdx];
  const selectedDate = formatDateFull(activeDay?.date ?? "");

  const todayIso = new Date().toISOString().slice(0, 10);
  const isToday = activeDay?.date === todayIso;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const isLessonNow = (l: { time_start: string; time_end: string }) =>
    isToday && nowMinutes >= toMin(l.time_start) && nowMinutes < toMin(l.time_end);

  return (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Header: week nav + day tabs */}
      <div className="shrink-0 bg-card border-b border-border">
        {/* Week navigation */}
        <div className="flex items-center justify-between px-4 py-2">
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="text-sm font-semibold">
                {selectedDate}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={activeDay?.date ? isoToLocalDate(activeDay.date) : undefined}
                onSelect={handleDateSelect}
                locale={ru}
                disabled={{ dayOfWeek: [0] }}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day tabs — only weekday label */}
        <div className="flex overflow-x-auto no-scrollbar">
          {fixedDays.map((day, idx) => {
            const isActive = idx === activeDayIdx;
            return (
              <Button
                key={day.date}
                variant="ghost"
                onClick={() => { goToDay(idx, idx > activeDayIdx ? "from-right" : "from-left"); }}
                className={`flex-1 flex items-center justify-center pb-2 pt-1 text-sm font-semibold border-b-2 transition-colors shrink-0 h-auto rounded-none ${
                  isActive
                    ? "border-primary text-primary hover:text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-transparent"
                }`}
              >
                {WEEKDAY_SHORT[day.weekday]}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Scrollable lesson area */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        {loading ? (
          <div className="px-4 pt-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 flex gap-3">
                  <div className="flex flex-col items-center justify-center w-14 shrink-0 gap-1.5">
                    <Skeleton className="h-5 w-10" />
                    <Skeleton className="h-5 w-10" />
                  </div>
                  <Skeleton className="w-px self-stretch" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div
            key={slideKey}
            className={`px-4 pt-4 pb-6 space-y-3 slide-${slideDir}`}
          >
            {activeDay?.lessons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-2xl mb-2">🎉</p>
                <p className="text-muted-foreground text-sm">Занятий нет</p>
              </div>
            ) : (
              activeDay?.lessons.map((lesson, i) => <LessonCard key={i} lesson={lesson} isNow={isLessonNow(lesson)} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gradebook tab
// ---------------------------------------------------------------------------

const GRADE_COLORS_TEXT: Record<string, string> = {
  "отлично": "text-green-600 dark:text-green-400",
  "хорошо": "text-blue-600 dark:text-blue-400",
  "удовлетворительно": "text-yellow-600 dark:text-yellow-500",
  "зачтено": "text-emerald-600 dark:text-emerald-400",
  "неудовлетворительно": "text-red-600 dark:text-red-400",
  "не зачтено": "text-red-600 dark:text-red-400",
};

function GradeDetailRow({ icon: Icon, label, value, className }: {
  icon: React.ElementType;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex gap-3 items-start">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium mt-0.5 ${className ?? ""}`}>{value}</p>
      </div>
    </div>
  );
}

function GradebookTab({ student }: { student: Student }) {
  const [data, setData] = useState<GradebookResponse | null>(() => {
    try {
      const cached = sessionStorage.getItem("gradebook");
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearIndex, setYearIndex] = useState(0);
  const [selected, setSelected] = useState<GradeEntry | null>(null);

  const loadGradebook = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGradebook(token);
      sessionStorage.setItem("gradebook", JSON.stringify(result));
      setData(result);
    } catch (err: unknown) {
      setError((err as Error).message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data) loadGradebook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 border-b border-border flex items-center px-2 py-2 gap-1">
          <Skeleton className="h-9 w-9 rounded-md shrink-0" />
          <Skeleton className="flex-1 h-5 mx-4" />
          <Skeleton className="h-9 w-9 rounded-md shrink-0" />
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="divide-y divide-border px-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center py-3 gap-4">
                <Skeleton className="flex-1 h-4" />
                <Skeleton className="w-10 h-4 shrink-0" />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (error) {
    const isSessionExpired = error.includes("Сессия истекла") || error.includes("Войдите заново");
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6 gap-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">{error}</p>
        {isSessionExpired ? (
          <Button onClick={() => { localStorage.removeItem("token"); window.location.href = "/login"; }}>
            Войти заново
          </Button>
        ) : (
          <Button variant="outline" onClick={loadGradebook}>Попробовать снова</Button>
        )}
      </div>
    );
  }

  if (!data) return null;

  const years = data.academic_years;
  const idx = Math.min(yearIndex, Math.max(0, years.length - 1));
  const activeYearData = years[idx];

  const parseDateNum = (d: string) => {
    const [dd, mm, yyyy] = (d ?? "").split(".");
    return parseInt(`${yyyy}${mm}${dd}`, 10) || 0;
  };

  const bySemester = new Map<number, GradeEntry[]>();
  for (const entry of activeYearData?.entries ?? []) {
    const list = bySemester.get(entry.semester) ?? [];
    list.push(entry);
    bySemester.set(entry.semester, list);
  }
  const semestersSorted = [...bySemester.keys()].sort((a, b) => a - b);

  return (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      {/* Year navigation */}
      <div className="shrink-0 border-b border-border flex items-center px-2 py-1 gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={idx >= years.length - 1}
          onClick={() => setYearIndex(idx + 1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <p className="flex-1 text-center text-sm font-semibold select-none">
          {activeYearData?.label ?? "—"}
        </p>
        <Button
          variant="ghost"
          size="icon"
          disabled={idx <= 0}
          onClick={() => setYearIndex(idx - 1)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Scrollable table area — constrained between header and navbar */}
      <ScrollArea key={idx} className="flex-1 min-h-0">
        <div className="pb-6">
          {semestersSorted.map((sem) => {
            const semEntries = [...(bySemester.get(sem) ?? [])].sort(
              (a, b) => parseDateNum(b.date) - parseDateNum(a.date)
            );
            return (
              <div key={sem}>
                <div className="px-4 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {sem} семестр
                </div>
                <Table>
                  <TableBody>
                    {semEntries.map((entry, i) => {
                      const gradeDisplay = entry.grade !== 0 ? String(entry.grade) : entry.grade_name;
                      return (
                        <TableRow
                          key={i}
                          className="cursor-pointer"
                          onClick={() => setSelected(entry)}
                        >
                          <TableCell className="py-3 pl-4 pr-2 text-sm leading-snug">{entry.discipline}</TableCell>
                          <TableCell className={`py-3 pl-2 pr-4 text-right text-sm font-semibold w-24 ${GRADE_COLORS_TEXT[entry.grade_name] ?? "text-foreground"}`}>
                            {gradeDisplay}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Detail bottom sheet */}
      <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
          <SheetHeader className="text-left mb-6">
            <SheetTitle className="text-base leading-snug pr-4">{selected?.discipline}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto pb-4">
            {selected?.test_type_name && (
              <GradeDetailRow icon={ClipboardList} label="Тип контроля" value={selected.test_type_name} />
            )}
            {selected?.grade_name && (
              <GradeDetailRow
                icon={Star}
                label="Оценка"
                value={selected.grade_name}
                className={GRADE_COLORS_TEXT[selected.grade_name]}
              />
            )}
            {selected?.lecturer && (
              <GradeDetailRow icon={GraduationCap} label="Преподаватель" value={selected.lecturer} />
            )}
            {selected?.date && (
              <GradeDetailRow icon={CalendarDays} label="Дата" value={selected.date} />
            )}
            {selected?.hours && (
              <GradeDetailRow icon={Clock} label="Часов" value={selected.hours} />
            )}
            {selected?.zet && (
              <GradeDetailRow icon={Layers} label="ЗЕТ" value={selected.zet} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab screens
// ---------------------------------------------------------------------------

function HomeTab({
  student,
  miniapps,
  onScan,
  onProfile,
}: {
  student: Student;
  miniapps: MiniApp[];
  onScan: () => void;
  onProfile: () => void;
}) {
  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12 ? "Доброе утро" :
    hour >= 12 && hour < 18 ? "Добрый день" :
    hour >= 18 && hour < 23 ? "Добрый вечер" :
    "Доброй ночи";

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {greeting}, {student.student_name.split(" ")[1] || student.student_name.split(" ")[0]}!
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onScan}
            className="rounded-xl bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary shrink-0"
            title="Отметить посещаемость"
          >
            <QrCode className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onProfile}
            className="rounded-xl bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary shrink-0"
            title="Профиль"
          >
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {miniapps.length === 0 ? (
        <p className="text-muted-foreground text-sm">Сервисы недоступны</p>
      ) : (
        <div className="space-y-3">
          {miniapps.map((app) => (
            <MiniAppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light",  label: "Светлая",  icon: Sun     },
  { value: "dark",   label: "Тёмная",   icon: Moon    },
  { value: "system", label: "Системная", icon: Monitor },
];

function ThemeCombobox() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const current = THEME_OPTIONS.find((o) => o.value === theme)!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <current.icon className="h-4 w-4" />
            {current.label}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandList>
            <CommandGroup>
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <CommandItem
                  key={value}
                  value={value}
                  onSelect={() => {
                    setTheme(value);
                    setOpen(false);
                  }}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {label}
                  <Check className={cn("ml-auto h-4 w-4", theme === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProfileSheet({ student, open, onClose }: { student: Student; open: boolean; onClose: () => void }) {
  const parts = student.student_name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="p-0 rounded-t-2xl">
        <SheetTitle className="sr-only">Профиль</SheetTitle>
        <div className="overflow-y-auto max-h-[85dvh] px-4 pt-6 pb-8">
          {/* Avatar + name + email */}
          <div className="flex flex-col items-center mb-5 gap-1.5">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground select-none">{initials}</span>
            </div>
            <p className="text-base font-semibold text-foreground text-center mt-1">{student.student_name}</p>
            <p className="text-sm text-muted-foreground text-center">{student.student_email}</p>
          </div>

          <div className="bg-card rounded-2xl border border-border divide-y divide-border">
            {student.faculty_abbr && (
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Институт</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{student.faculty_abbr}</p>
              </div>
            )}
            {student.study_group_str && (
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Учебная группа</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{student.study_group_str}</p>
              </div>
            )}
            {student.grade_book_number && (
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Номер зачётной книжки</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{student.grade_book_number}</p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-foreground mb-2">Тема оформления</p>
            <ThemeCombobox />
          </div>

          <Button
            variant="outline"
            className="mt-6 w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-red-900 dark:hover:bg-red-950"
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
          >
            Выйти
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Router + root
// ---------------------------------------------------------------------------

export default function App() {
  if (window.location.pathname === "/login") {
    return <LoginPage />;
  }
  return <HomePage />;
}

function HomePage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [miniapps, setMiniApps] = useState<MiniApp[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [servicesOpen, setServicesOpen] = useState(false);
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    if (tokenFromUrl) {
      localStorage.setItem("token", tokenFromUrl);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    // fetchMiniApps failure is non-fatal — show empty list rather than forcing re-login
    Promise.all([fetchMe(token), fetchMiniApps(token).catch(() => [] as MiniApp[])])
      .then(([me, apps]) => {
        setStudent(me);
        setMiniApps(apps);
      })
      .catch(() => {
        localStorage.removeItem("token");
        window.location.href = "/login";
      });
  }, []);

  const handleTabChange = (t: Tab) => {
    if (t === "services") {
      setServicesOpen(true);
      window.history.pushState({ services: true }, "");
    } else {
      setTab(t);
    }
  };

  // Push history entry when traffic sheet opens so back button can close it
  useEffect(() => {
    if (trafficOpen) {
      window.history.pushState({ traffic: true }, "");
    }
  }, [trafficOpen]);

  // Close sheets on browser back
  useEffect(() => {
    const onPopState = () => {
      if (trafficOpen) {
        setTrafficOpen(false);
      } else if (servicesOpen) {
        setServicesOpen(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [trafficOpen, servicesOpen]);

  if (!student) {
    return (
      <div className="h-screen overflow-hidden bg-background">
        <div className="h-full overflow-y-auto pb-20 px-4 py-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <Skeleton className="h-7 w-52" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="h-9 w-9 rounded-xl" />
              </div>
            </div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 h-16" />
      </div>
    );
  }

  const servicesApp = miniapps.find((a) => a.id === "services");
  const trafficApp = miniapps.find((a) => a.id === "traffic");

  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className={`h-full ${tab === "schedule" || tab === "gradebook" ? "overflow-hidden" : "overflow-y-auto pb-20"}`}>
        {tab === "home"      && <HomeTab student={student} miniapps={miniapps} onScan={() => setTrafficOpen(true)} onProfile={() => setProfileOpen(true)} />}
        {tab === "schedule"  && <ScheduleTab student={student} />}
        {tab === "gradebook" && <GradebookTab student={student} />}
      </div>

      <BottomNav active={servicesOpen ? "services" : tab} onChange={handleTabChange} />

      <ProfileSheet student={student} open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ServicesSheet
        app={servicesApp}
        open={servicesOpen}
        onClose={() => setServicesOpen(false)}
      />
      <TrafficSheet
        app={trafficApp}
        open={trafficOpen}
        onClose={() => setTrafficOpen(false)}
      />
    </div>
  );
}
