import { useEffect, useRef, useState } from "react";
import { Pi, CalendarDays, BookOpen, FileText, User, X, QrCode } from "lucide-react";
import { fetchMe, fetchMiniApps, fetchLaunchToken, fetchResolveGroup, fetchSchedule } from "./api";
import type { MiniApp, Student, WeekSchedule, DaySchedule } from "./types";
import LoginPage from "./DevLoginPage";

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
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors"
              style={{ color: isActive ? "#2563eb" : "#9ca3af" }}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
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
  onClose,
}: {
  app: MiniApp | undefined;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [href, setHref] = useState<string | null>(null);
  const closingRef = useRef(false);

  // Slide in after mount (next frame so CSS transition fires)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Fetch launch token and build iframe URL
  useEffect(() => {
    if (!app) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchLaunchToken(token).then((launchToken) => {
      setHref(`${app.url}?launch_token=${encodeURIComponent(launchToken)}`);
    });
  }, [app]);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    setTimeout(() => {
      onClose();
      // Also update browser history if we pushed a state on open
      if (window.history.state?.services) {
        window.history.back();
      }
    }, 320);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      style={{
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      {/* Sheet header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0 bg-white">
        <span className="font-semibold text-gray-900">Услуги</span>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Mini-app iframe */}
      {href ? (
        <iframe src={href} className="flex-1 w-full border-0" title="Заявки" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          {app ? "Загрузка..." : "Сервис недоступен"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Traffic sheet — camera scanner iframe for attendance
// ---------------------------------------------------------------------------

function TrafficSheet({
  app,
  onClose,
}: {
  app: MiniApp | undefined;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [href, setHref] = useState<string | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!app) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchLaunchToken(token).then((launchToken) => {
      setHref(`${app.url}/scan?launch_token=${encodeURIComponent(launchToken)}`);
    });
  }, [app]);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    setTimeout(() => onClose(), 320);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      style={{
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0 bg-white">
        <span className="font-semibold text-gray-900">Посещаемость</span>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {href ? (
        <iframe
          src={href}
          allow="camera"
          className="flex-1 w-full border-0"
          title="Посещаемость"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          {app ? "Загрузка..." : "Сервис недоступен"}
        </div>
      )}
    </div>
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
    <button
      onClick={handleClick}
      className="group block w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-blue-200 transition-all duration-200"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
            {app.name}
          </h3>
          {app.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{app.description}</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Schedule tab
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT = ["", "Пн", "Тв", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatDateShort(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function LessonCard({ lesson }: { lesson: DaySchedule["lessons"][number] }) {
  const loc = lesson.auditories
    .map((a) => (a.building ? `${a.name} (${a.building})` : a.name))
    .join(", ");
  const teacher = lesson.teachers.map((t) => t.full_name).join(", ");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3">
      <div className="flex flex-col items-center text-center w-14 shrink-0">
        <span className="text-sm font-bold text-gray-900">{lesson.time_start}</span>
        <span className="text-xs text-gray-400">{lesson.time_end}</span>
      </div>
      <div className="w-px bg-gray-100 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">
            {lesson.type_abbr}
          </span>
          <p className="text-sm font-semibold text-gray-900 leading-tight">{lesson.subject}</p>
        </div>
        {teacher && <p className="text-xs text-gray-500 mt-1 truncate">{teacher}</p>}
        {loc && <p className="text-xs text-gray-400 mt-0.5 truncate">{loc}</p>}
        {lesson.additional_info && (
          <p className="text-xs text-gray-400 mt-0.5 italic">{lesson.additional_info}</p>
        )}
      </div>
    </div>
  );
}

function ScheduleTab({ student }: { student: Student }) {
  const [groupId, setGroupId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState<number>(0);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let gid = groupId;
        if (!gid) {
          if (!student.faculty_abbr || !student.study_group_str) {
            setError("Группа не определена в профиле");
            setLoading(false);
            return;
          }
          const resolved = await fetchResolveGroup(token, student.faculty_abbr, student.study_group_str);
          gid = resolved.group_id;
          setGroupId(gid);
        }
        const data = await fetchSchedule(token, gid);
        setSchedule(data);
        // Auto-select today's day if present
        const todayIso = new Date().toISOString().slice(0, 10);
        const idx = data.days.findIndex((d: DaySchedule) => d.date === todayIso);
        setActiveDayIdx(idx >= 0 ? idx : 0);
      } catch (e: unknown) {
        setError((e as Error).message ?? "Ошибка загрузки расписания");
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
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
          <button
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Войти заново
          </button>
        )}
      </div>
    );
  }

  const days = schedule.days;
  const activeDay = days[activeDayIdx];

  return (
    <div>
      {/* Sticky day tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-4 pb-0">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {days.map((day, idx) => {
            const isActive = idx === activeDayIdx;
            return (
              <button
                key={day.date}
                onClick={() => setActiveDayIdx(idx)}
                className={`flex flex-col items-center px-3 pb-2 pt-1 rounded-t-xl text-xs font-medium shrink-0 border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <span className="text-base font-bold">{WEEKDAY_SHORT[day.weekday]}</span>
                <span>{formatDateShort(day.date)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lessons */}
      <div className="px-4 py-4 space-y-3">
        {activeDay?.lessons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-gray-400 text-sm">Занятий нет</p>
          </div>
        ) : (
          activeDay?.lessons.map((lesson, i) => <LessonCard key={i} lesson={lesson} />)
        )}
      </div>
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
        <button
          onClick={onScan}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors shrink-0"
          title="Отметить посещаемость"
        >
          <QrCode className="h-5 w-5" />
        </button>
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

      <button
        className="mt-6 w-full py-2.5 rounded-xl text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
        onClick={() => {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }}
      >
        Выйти
      </button>
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

      {servicesOpen && (
        <ServicesSheet
          app={servicesApp}
          onClose={() => setServicesOpen(false)}
        />
      )}

      {trafficOpen && (
        <TrafficSheet
          app={trafficApp}
          onClose={() => setTrafficOpen(false)}
        />
      )}
    </div>
  );
}
