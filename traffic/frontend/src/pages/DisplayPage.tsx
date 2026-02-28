import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/api/client";
import { computeQrToken, currentWindow, msUntilNextWindow } from "@/lib/hmac";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DisplayState = "unregistered" | "waiting" | "active";

interface TabletInfo {
  id: string;
  is_registered: boolean;
  building_name: string | null;
  room_name: string | null;
  building_id: number | null;
  room_id: number | null;
}

interface CurrentSession {
  active: boolean;
  session_id?: string;
  discipline?: string;
  teacher_name?: string;
  qr_secret?: string;
  rotate_seconds?: number;
  attendance_count?: number;
}

interface RuzLesson {
  time_start: string;
  time_end: string;
  subject: string;
  typeObj: { abbr: string };
  teachers: { full_name: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreateDeviceId(): string | null {
  return localStorage.getItem("traffic_device_id");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DisplayPage() {
  const [displayState, setDisplayState] = useState<DisplayState>("unregistered");
  const [tablet, setTablet] = useState<TabletInfo | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [qrToken, setQrToken] = useState<string>("");
  const [todayLessons, setTodayLessons] = useState<RuzLesson[]>([]);

  const deviceIdRef = useRef<string | null>(getOrCreateDeviceId());
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // QR generation (frontend HMAC — no backend polling for token)
  // ---------------------------------------------------------------------------

  async function generateQr(secret: string, sessionId: string, rotateSeconds: number) {
    const win = currentWindow(rotateSeconds);
    const token = await computeQrToken(secret, sessionId, win);
    setQrToken(token);

    // Schedule next rotation
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    qrTimerRef.current = setTimeout(
      () => generateQr(secret, sessionId, rotateSeconds),
      msUntilNextWindow(rotateSeconds),
    );
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  async function initDevice() {
    if (deviceIdRef.current) return;
    try {
      const res = await api.post<{ device_id: string }>("/tablets/init");
      deviceIdRef.current = res.data.device_id;
      localStorage.setItem("traffic_device_id", res.data.device_id);
    } catch {
      // retry on next poll
    }
  }

  async function pollTablet() {
    const deviceId = deviceIdRef.current;
    if (!deviceId) {
      await initDevice();
      schedulePoll(3000);
      return;
    }
    try {
      const res = await api.get<TabletInfo>(`/tablets/${deviceId}`);
      setTablet(res.data);
      if (!res.data.is_registered) {
        setDisplayState("unregistered");
        schedulePoll(3000);
      } else {
        pollSession();
      }
    } catch {
      schedulePoll(5000);
    }
  }

  async function pollSession() {
    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    try {
      const res = await api.get<CurrentSession>(`/sessions/current?device_id=${deviceId}`);
      if (res.data.active) {
        setSession(res.data);
        setDisplayState("active");
        if (res.data.qr_secret && res.data.session_id && res.data.rotate_seconds) {
          // Only (re)start QR generation if secret changed (new session)
          generateQr(res.data.qr_secret, res.data.session_id, res.data.rotate_seconds);
        }
      } else {
        setSession(null);
        setDisplayState("waiting");
        if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
      }
    } catch {
      // keep current state
    }
    schedulePoll(3000);
  }

  function schedulePoll(ms: number) {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(pollTablet, ms);
  }

  // ---------------------------------------------------------------------------
  // Schedule for waiting screen
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (displayState !== "waiting" || !tablet?.building_id || !tablet?.room_id) return;
    const today = new Date().toISOString().split("T")[0];
    api
      .get(`/schedule/buildings/${tablet.building_id}/rooms/${tablet.room_id}/scheduler?date=${today}`)
      .then((res) => {
        const todayWeekday = new Date().getDay() || 7; // 1-7
        const day = res.data.days?.find((d: { weekday: number }) => d.weekday === todayWeekday);
        setTodayLessons(day?.lessons ?? []);
      })
      .catch(() => {});
  }, [displayState, tablet?.building_id, tablet?.room_id]);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    pollTablet();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const deviceId = deviceIdRef.current;
  const registrationQr = deviceId
    ? `${window.location.origin}/admin/tablets/register/${deviceId}`
    : "";
  const teacherQr = deviceId
    ? `${window.location.origin}/teacher/session?device=${deviceId}`
    : "";
  const studentQrValue =
    session?.active && qrToken
      ? JSON.stringify({ s: session.session_id, t: qrToken })
      : null;

  const roomLabel =
    tablet?.building_name && tablet?.room_name
      ? `${tablet.building_name}, ауд. ${tablet.room_name}`
      : null;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function QrPanel({ value }: { value: string }) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white p-6 rounded-3xl shadow-2xl">
          <QRCodeSVG value={value} size={520} level="M" />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------------

  if (displayState === "unregistered") {
    return (
      <div className="h-screen overflow-hidden bg-gray-950 text-white select-none flex">
        <QrPanel value={registrationQr || "no-device"} />
        <div className="flex-1 flex flex-col justify-center px-16 gap-6">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
            Новый планшет
          </p>
          <h1 className="text-5xl font-bold leading-tight">
            Регистрация аудитории
          </h1>
          <p className="text-2xl text-gray-400 leading-relaxed">
            Администратор должен отсканировать QR-код и привязать этот планшет к аудитории
          </p>
        </div>
      </div>
    );
  }

  if (displayState === "waiting") {
    return (
      <div className="h-screen overflow-hidden bg-gray-950 text-white select-none flex">
        <QrPanel value={teacherQr || "no-device"} />
        <div className="flex-1 flex flex-col justify-center px-16 gap-6 overflow-hidden">
          {roomLabel && (
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
              {roomLabel}
            </p>
          )}
          <h1 className="text-5xl font-bold leading-tight">
            Ожидание занятия
          </h1>
          <p className="text-2xl text-gray-400 leading-relaxed">
            Преподаватель сканирует QR-код для запуска проверки посещаемости
          </p>

          {todayLessons.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 overflow-y-auto max-h-72">
              <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">
                Расписание на сегодня
              </p>
              {todayLessons.map((lesson, i) => (
                <div key={i} className="flex gap-4 text-gray-300">
                  <span className="text-gray-500 font-mono text-lg whitespace-nowrap">
                    {lesson.time_start}–{lesson.time_end}
                  </span>
                  <div>
                    <span className="font-medium">{lesson.subject}</span>
                    <span className="text-gray-500 ml-2 text-sm">{lesson.typeObj?.abbr}</span>
                    {lesson.teachers?.[0] && (
                      <p className="text-gray-500 text-sm">{lesson.teachers[0].full_name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // active
  return (
    <div className="h-screen overflow-hidden bg-gray-950 text-white select-none flex">
      <QrPanel value={studentQrValue ?? "loading"} />
      <div className="flex-1 flex flex-col justify-center px-16 gap-6">
        {roomLabel && (
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
            {roomLabel}
          </p>
        )}
        <p className="text-xs text-green-500 uppercase tracking-widest font-semibold">
          Занятие идёт
        </p>
        <h1 className="text-5xl font-bold leading-tight break-words">
          {session?.discipline}
        </h1>
        <p className="text-xl text-gray-400">{session?.teacher_name}</p>
        <p className="text-lg text-gray-400 leading-relaxed">
          Открой приложение Политехник, нажми на значок QR и наведи камеру на этот экран
        </p>
        {session?.attendance_count !== undefined && (
          <p className="text-3xl font-bold text-white">
            {session.attendance_count}{" "}
            <span className="text-gray-500 text-xl font-normal">
              {session.attendance_count === 1 ? "студент" : "студентов"} отмечено
            </span>
          </p>
        )}
        <Button
          variant="ghost"
          onClick={async () => {
            if (session?.session_id) {
              // Teacher ends via their cabinet; this is an emergency close
              // (no auth — just stop polling)
              setSession(null);
              setDisplayState("waiting");
            }
          }}
          className="mt-2 w-fit text-gray-600 hover:text-red-400 hover:bg-transparent"
        >
          <XCircle className="h-4 w-4 mr-2" />
          Завершить занятие
        </Button>
      </div>
    </div>
  );
}
