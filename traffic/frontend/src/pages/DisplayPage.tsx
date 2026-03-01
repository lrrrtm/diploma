import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
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
  typeObj: { abbr: string; name?: string };
  teachers: { full_name: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStoredDeviceId(): string | null {
  return localStorage.getItem("traffic_device_id");
}

function getStoredDisplayPin(): string | null {
  return localStorage.getItem("traffic_display_pin");
}

/** Renders a 6-digit PIN as two groups of 3 for readability */
function PinDisplay({ pin }: { pin: string }) {
  const value = pin.slice(0, 6);

  return (
    <div className="w-full px-2 sm:px-4">
      <InputOTP
        value={value}
        onChange={() => {}}
        maxLength={6}
        disabled
        containerClassName="w-full justify-center gap-2 sm:gap-3 has-[:disabled]:opacity-100"
        className="pointer-events-none"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} className="h-14 w-10 sm:h-16 sm:w-12 md:h-20 md:w-14 lg:h-24 lg:w-16 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-mono font-bold" />
          <InputOTPSlot index={1} className="h-14 w-10 sm:h-16 sm:w-12 md:h-20 md:w-14 lg:h-24 lg:w-16 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-mono font-bold" />
          <InputOTPSlot index={2} className="h-14 w-10 sm:h-16 sm:w-12 md:h-20 md:w-14 lg:h-24 lg:w-16 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-mono font-bold" />
        </InputOTPGroup>
        <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-mono text-gray-600">-</span>
        <InputOTPGroup>
          <InputOTPSlot index={3} className="h-14 w-10 sm:h-16 sm:w-12 md:h-20 md:w-14 lg:h-24 lg:w-16 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-mono font-bold" />
          <InputOTPSlot index={4} className="h-14 w-10 sm:h-16 sm:w-12 md:h-20 md:w-14 lg:h-24 lg:w-16 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-mono font-bold" />
          <InputOTPSlot index={5} className="h-14 w-10 sm:h-16 sm:w-12 md:h-20 md:w-14 lg:h-24 lg:w-16 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-mono font-bold" />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
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
  const [regPin, setRegPin] = useState<string>("");

  const deviceIdRef = useRef<string | null>(getStoredDeviceId());
  const displayPinRef = useRef<string | null>(getStoredDisplayPin());
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // QR generation (frontend HMAC — no backend polling for token)
  // ---------------------------------------------------------------------------

  async function generateQr(secret: string, sessionId: string, rotateSeconds: number) {
    const win = currentWindow(rotateSeconds);
    const token = await computeQrToken(secret, sessionId, win);
    setQrToken(token);

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
      const res = await api.post<{ device_id: string; reg_pin: string; display_pin: string }>("/tablets/init");
      deviceIdRef.current = res.data.device_id;
      displayPinRef.current = res.data.display_pin;
      localStorage.setItem("traffic_device_id", res.data.device_id);
      localStorage.setItem("traffic_display_pin", res.data.display_pin);
      setRegPin(res.data.reg_pin);
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
      const res = await api.get<TabletInfo & { reg_pin?: string }>(`/tablets/${deviceId}`);
      setTablet(res.data);
      if (!res.data.is_registered) {
        if (res.data.reg_pin) setRegPin(res.data.reg_pin);
        setDisplayState("unregistered");
        schedulePoll(3000);
      } else {
        pollSession();
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        localStorage.removeItem("traffic_device_id");
        localStorage.removeItem("traffic_display_pin");
        deviceIdRef.current = null;
        displayPinRef.current = null;
        setTablet(null);
        setSession(null);
        setRegPin("");
        setDisplayState("unregistered");
        if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
      }
      schedulePoll(5000);
    }
  }

  async function pollSession() {
    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    try {
      const res = await api.get<CurrentSession>(
        `/sessions/current?device_id=${deviceId}&tablet_secret=${displayPinRef.current ?? ""}`,
      );
      if (res.data.active) {
        setSession(res.data);
        setDisplayState("active");
        if (res.data.qr_secret && res.data.session_id && res.data.rotate_seconds) {
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
        const todayWeekday = new Date().getDay() || 7;
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

  const studentQrValue =
    session?.active && qrToken
      ? JSON.stringify({ s: session.session_id, t: qrToken })
      : null;

  const roomLabel =
    tablet?.building_name && tablet?.room_name
      ? `${tablet.building_name}, ауд. ${tablet.room_name}`
      : null;

  // The display_pin used for teacher session start (stored in localStorage)
  const displayPin = displayPinRef.current ?? "";

  // ---------------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------------

  if (displayState === "unregistered") {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground select-none flex flex-col items-center justify-center gap-8 px-6 sm:px-8">
        <div className="flex flex-col items-center gap-6">
          {regPin ? (
            <PinDisplay pin={regPin} />
          ) : (
            <Spinner className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
        <p className="text-xl sm:text-2xl text-foreground text-center leading-relaxed max-w-xl">
          Введите этот код в интерфейсе администратора, чтобы привязать киоск к аудитории
        </p>
      </div>
    );
  }

  if (displayState === "waiting") {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground select-none flex">
        <div className="flex-1 flex items-center justify-center">
          {displayPin ? (
            <PinDisplay pin={displayPin} />
          ) : (
            <Spinner className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center px-16 gap-6 overflow-hidden">
          <h1 className="text-5xl font-bold leading-tight">
            Ожидание занятия
          </h1>
          <p className="text-2xl text-muted-foreground leading-relaxed">
            Введите этот код в интерфейсе преподавателя, чтобы запустить проверку посещаемости
          </p>

          {(roomLabel || todayLessons.length > 0) && (
            <div className="mt-2 flex flex-col gap-4 overflow-y-auto max-h-80">
              {roomLabel && (
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                  {roomLabel}
                </p>
              )}
              {todayLessons.map((lesson, i) => (
                <div key={i} className="flex gap-5 text-foreground">
                  <span className="text-muted-foreground text-xl whitespace-nowrap shrink-0 w-44">
                    {lesson.time_start}–{lesson.time_end}
                  </span>
                  <div>
                    <p className="font-medium text-xl leading-snug">{lesson.subject}</p>
                    <p className="text-muted-foreground text-base">
                      {lesson.typeObj?.name ?? lesson.typeObj?.abbr}
                      {lesson.teachers?.[0] && (
                        <span className="ml-2">·&nbsp;{lesson.teachers[0].full_name}</span>
                      )}
                    </p>
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
    <div className="h-screen overflow-hidden bg-background text-foreground select-none flex">
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white p-6 rounded-3xl shadow-2xl">
          <QRCodeSVG value={studentQrValue ?? "loading"} size={520} level="M" />
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-16 gap-6">
        {roomLabel && (
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
            {roomLabel}
          </p>
        )}
        <p className="text-xs text-green-500 uppercase tracking-widest font-semibold">
          Занятие идёт
        </p>
        <h1 className="text-5xl font-bold leading-tight break-words">
          {session?.discipline}
        </h1>
        <p className="text-xl text-muted-foreground">{session?.teacher_name}</p>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Открой приложение Политехник, нажми на значок QR и наведи камеру на этот экран
        </p>
        {session?.attendance_count !== undefined && (
          <p className="text-3xl font-bold text-foreground">
            {session.attendance_count}{" "}
            <span className="text-muted-foreground text-xl font-normal">
              {session.attendance_count === 1 ? "студент" : "студентов"} отмечено
            </span>
          </p>
        )}
        <Button
          variant="ghost"
          onClick={async () => {
            if (session?.session_id) {
              setSession(null);
              setDisplayState("waiting");
            }
          }}
          className="mt-2 w-fit text-muted-foreground hover:text-red-500 hover:bg-transparent"
        >
          <XCircle className="h-4 w-4 mr-2" />
          Завершить занятие
        </Button>
      </div>
    </div>
  );
}
