import { useEffect, useRef, useState } from "react";
import { Home, CalendarDays, BookOpen, FileText, User, ArrowLeft } from "lucide-react";
import { fetchMe, fetchMiniApps, fetchLaunchToken } from "./api";
import type { MiniApp, Student } from "./types";
import LoginPage from "./DevLoginPage";

// ---------------------------------------------------------------------------
// Bottom navbar
// ---------------------------------------------------------------------------

type Tab = "home" | "schedule" | "gradebook" | "services" | "profile";

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home",      label: "Главная",    icon: Home         },
  { id: "schedule",  label: "Расписание", icon: CalendarDays },
  { id: "gradebook", label: "Зачётка",    icon: BookOpen     },
  { id: "services",  label: "Услуги",     icon: FileText     },
  { id: "profile",   label: "Профиль",    icon: User         },
];

function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
      <div className="max-w-2xl mx-auto flex">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              active === id ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Services sheet — slides up over the whole screen
// ---------------------------------------------------------------------------

function ServicesSheet({
  app,
}: {
  app: MiniApp | undefined;
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
      window.history.back();
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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 shrink-0 bg-white">
        <button
          onClick={handleClose}
          className="p-1 -ml-1 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <span className="font-semibold text-gray-900">Заявки</span>
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

function HomeTab({ student, miniapps }: { student: Student; miniapps: MiniApp[] }) {
  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Привет, {student.student_name.split(" ")[1] || student.student_name.split(" ")[0]}!
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{student.student_email}</p>
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Загрузка...</p>
      </div>
    );
  }

  const servicesApp = miniapps.find((a) => a.id === "services");

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {tab === "home"      && <HomeTab student={student} miniapps={miniapps} />}
      {tab === "schedule"  && <ComingSoon label="Расписание" />}
      {tab === "gradebook" && <ComingSoon label="Зачётка" />}
      {tab === "profile"   && <ProfileTab student={student} />}

      <BottomNav active={servicesOpen ? "services" : tab} onChange={handleTabChange} />

      {servicesOpen && (
        <ServicesSheet
          app={servicesApp}
        />
      )}
    </div>
  );
}
