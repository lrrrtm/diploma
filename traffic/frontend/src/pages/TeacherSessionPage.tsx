import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Users, X } from "lucide-react";
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
      <div className="h-full overflow-hidden flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="font-semibold text-gray-900 text-sm">Посещаемость</p>
          <p className="text-xs text-gray-500">{teacherName}</p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {!session.active ? (
          /* ── No active session — create one ── */
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Новое занятие</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Название дисциплины
              </label>
              <input
                type="text"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="Например: Математический анализ"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {starting ? "Запуск..." : "Начать занятие"}
            </button>

            <p className="text-xs text-gray-400 text-center">
              После запуска на экране аудитории появится QR-код для студентов
            </p>
          </div>
        ) : (
          /* ── Active session ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{session.discipline}</h2>
                <p className="text-sm text-gray-500">Занятие идёт</p>
              </div>
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Завершить
              </button>
            </div>

            {/* Attendee count */}
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500 shrink-0" />
              <p className="text-sm font-medium text-gray-900">
                Присутствует: <span className="text-blue-600">{attendees.length}</span>
              </p>
            </div>

            {/* Attendee list */}
            {attendees.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Студенты ещё не отметились
              </p>
            ) : (
              <div className="space-y-2">
                {attendees.map((a) => (
                  <div
                    key={a.student_external_id}
                    className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.student_name}</p>
                      <p className="text-xs text-gray-400">{a.student_email}</p>
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(a.marked_at).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
