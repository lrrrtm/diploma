import { useEffect, useRef, useState } from "react";
import { Pi, CalendarDays, BookOpen, FileText, User, QrCode, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchMe, fetchMiniApps, fetchLaunchToken, fetchResolveGroup, fetchSchedule } from "./api";
import type { MiniApp, Student, WeekSchedule, DaySchedule } from "./types";
import LoginPage from "./DevLoginPage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ru } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Bottom navbar
// ---------------------------------------------------------------------------

type Tab = "home" | "schedule" | "gradebook" | "services" | "profile";

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home",      label: "Главная",    icon: Pi         },
  { id: "schedule",  label: "Расписание", icon: CalendarDays },
  { id: "gradebook", label: "Зачётка",    icon: BookOpen     },
  { id: "services",  label: "Услуги",     icon: FileText     },
  { id: "profile",   label: "Профиль",    icon: User         },
];

function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
      <div className="max-w-2xl mx-auto flex">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <Button
              key={id}
              variant="ghost"
              onClick={() => onChange(id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 px-0 text-xs h-auto rounded-none whitespace-normal [&_svg]:size-5"
              style={{ color: isActive ? "#2563eb" : "#9ca3af" }}
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

  useEffect(() => {
    if (!open || !app) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchLaunchToken(token).then((launchToken) => {
      setHref(`${app.url}?launch_token=${encodeURIComponent(launchToken)}`);
    });
  }, [open, app]);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="h-[100dvh] p-0 gap-0 flex flex-col rounded-none">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle>Услуги</SheetTitle>
        </SheetHeader>
        {href ? (
          <iframe src={href} className="flex-1 w-full border-0" title="Заявки" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {app ? "Загрузка..." : "Сервис недоступен"}
          </div>
        )}
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

  useEffect(() => {
    if (!open || !app) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchLaunchToken(token).then((launchToken) => {
      setHref(`${app.url}/scan?launch_token=${encodeURIComponent(launchToken)}`);
    });
  }, [open, app]);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="h-[100dvh] p-0 gap-0 flex flex-col rounded-none">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle>Посещаемость</SheetTitle>
        </SheetHeader>
        {href ? (
          <iframe
            src={href}
            allow="camera"
            className="flex-1 w-full border-0"
            title="Посещаемость"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {app ? "Загрузка..." : "Сервис недоступен"}
          </div>
        )}
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
    const launchToken = await fetchLaunchToken(token);
    window.open(`${app.url}?launch_token=${encodeURIComponent(launchToken)}`, "_blank");
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all duration-200"
      onClick={handleClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{app.name}</p>
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

function LessonCard({ lesson }: { lesson: DaySchedule["lessons"][number] }) {
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
          <span className="text-base font-bold">{lesson.time_start}</span>
          <span className="text-base text-muted-foreground">{lesson.time_end}</span>
        </div>
        <Separator orientation="vertical" className="shrink-0 self-stretch h-auto" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight">{lesson.subject}</p>
          <Badge variant="secondary" className="mt-1.5">{lesson.type_name}</Badge>
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
      else { setSlideDir("from-left"); setSlideKey((k) => k + 1); setWeekOffset((o) => o - 1); }
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !schedule) {
    const isStaleToken = !student.faculty_abbr || !student.study_group_str;
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6 gap-4">
        <p className="text-gray-500 text-sm">
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

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Sticky header: week nav + day tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
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
                    ? "border-blue-600 text-blue-600 hover:text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-transparent"
                }`}
              >
                {WEEKDAY_SHORT[day.weekday]}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Loading overlay for week switch */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div
          key={slideKey}
          className={`px-4 pt-4 pb-24 space-y-3 overflow-hidden slide-${slideDir}`}
        >
          {activeDay?.lessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-gray-400 text-sm">Занятий нет</p>
            </div>
          ) : (
            activeDay?.lessons.map((lesson, i) => <LessonCard key={i} lesson={lesson} />)
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder
// ---------------------------------------------------------------------------

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-2xl mb-2">🚧</p>
      <p className="text-gray-500 text-sm">{label} — скоро</p>
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
}: {
  student: Student;
  miniapps: MiniApp[];
  onScan: () => void;
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
          <h1 className="text-xl font-bold text-gray-900">
            {greeting}, {student.student_name.split(" ")[1] || student.student_name.split(" ")[0]}!
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onScan}
          className="rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-600 shrink-0"
          title="Отметить посещаемость"
        >
          <QrCode className="h-5 w-5" />
        </Button>
      </div>

      {miniapps.length === 0 ? (
        <p className="text-gray-400 text-sm">Сервисы недоступны</p>
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

function ProfileTab({ student }: { student: Student }) {
  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Профиль</h2>
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400">ФИО</p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{student.student_name}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400">Email</p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{student.student_email}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400">ID студента</p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{student.student_id}</p>
        </div>
        {student.study_group_str && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400">Учебная группа</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{student.study_group_str}</p>
          </div>
        )}
        {student.faculty_abbr && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400">Институт</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{student.faculty_abbr}</p>
          </div>
        )}
        {student.grade_book_number && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400">Номер зачётной книжки</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{student.grade_book_number}</p>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="mt-6 w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-500"
        onClick={() => {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }}
      >
        Выйти
      </Button>
    </div>
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

    Promise.all([fetchMe(token), fetchMiniApps(token)])
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

  // Close services sheet on browser back
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (servicesOpen) {
        e.preventDefault();
        setServicesOpen(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [servicesOpen]);

  if (!student) {
    return (
      <div className="h-screen overflow-hidden flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Загрузка...</p>
      </div>
    );
  }

  const servicesApp = miniapps.find((a) => a.id === "services");
  const trafficApp = miniapps.find((a) => a.id === "traffic");

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
      <div className="h-full overflow-y-auto pb-20">
        {tab === "home"      && <HomeTab student={student} miniapps={miniapps} onScan={() => setTrafficOpen(true)} />}
        {tab === "schedule"  && <ScheduleTab student={student} />}
        {tab === "gradebook" && <ComingSoon label="Зачётка" />}
        {tab === "profile"   && <ProfileTab student={student} />}
      </div>

      <BottomNav active={servicesOpen ? "services" : tab} onChange={handleTabChange} />

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
