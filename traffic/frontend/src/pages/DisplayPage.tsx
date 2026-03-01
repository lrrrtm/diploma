import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Spinner } from "@/components/ui/spinner";
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
type StreamBannerState = "hidden" | "offline" | "recovered";
type StreamBannerTone = "offline" | "recovered";

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

interface TabletStreamPayload {
  tablet: (TabletInfo & { reg_pin?: string }) | null;
  session: CurrentSession;
  server_time?: string;
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

function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayFromDateKey(dateKey: string): number {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.getDay() || 7;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseClockToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function findActiveLessonIndex(lessons: RuzLesson[], discipline: string | undefined, now: Date): number {
  if (lessons.length === 0) return -1;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const disciplineNorm = normalizeText(discipline);

  const timeMatchIndex = lessons.findIndex((lesson) => {
    const start = parseClockToMinutes(lesson.time_start);
    const end = parseClockToMinutes(lesson.time_end);
    if (start === null || end === null) return false;
    return nowMinutes >= start && nowMinutes < end;
  });

  if (!disciplineNorm) return timeMatchIndex;

  if (timeMatchIndex !== -1) {
    const subjectNorm = normalizeText(lessons[timeMatchIndex]?.subject);
    if (subjectNorm.includes(disciplineNorm) || disciplineNorm.includes(subjectNorm)) {
      return timeMatchIndex;
    }
  }

  const disciplineMatchIndex = lessons.findIndex((lesson) => {
    const subjectNorm = normalizeText(lesson.subject);
    return subjectNorm.includes(disciplineNorm) || disciplineNorm.includes(subjectNorm);
  });

  if (disciplineMatchIndex !== -1) return disciplineMatchIndex;
  return timeMatchIndex;
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
  const STREAM_STALE_MS = 15000;
  const SCHEDULE_REFRESH_MS = 5 * 60 * 1000;
  const DATE_CHECK_INTERVAL_MS = 30 * 1000;
  const [displayState, setDisplayState] = useState<DisplayState>("unregistered");
  const [tablet, setTablet] = useState<TabletInfo | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [qrToken, setQrToken] = useState<string>("");
  const [todayLessons, setTodayLessons] = useState<RuzLesson[]>([]);
  const [regPin, setRegPin] = useState<string>("");
  const [now, setNow] = useState<Date>(() => new Date());
  const [streamBannerState, setStreamBannerState] = useState<StreamBannerState>("hidden");
  const [streamBannerTone, setStreamBannerTone] = useState<StreamBannerTone>("offline");

  const deviceIdRef = useRef<string | null>(getStoredDeviceId());
  const displayPinRef = useRef<string | null>(getStoredDisplayPin());
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStreamActivityRef = useRef<number>(Date.now());
  const disconnectedRef = useRef<boolean>(false);
  const hideBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function resetDeviceState() {
    localStorage.removeItem("traffic_device_id");
    localStorage.removeItem("traffic_display_pin");
    deviceIdRef.current = null;
    displayPinRef.current = null;
    setTablet(null);
    setSession(null);
    setRegPin("");
    setDisplayState("unregistered");
    setQrToken("");
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
  }

  function clearHideBannerTimer() {
    if (!hideBannerTimerRef.current) return;
    clearTimeout(hideBannerTimerRef.current);
    hideBannerTimerRef.current = null;
  }

  function markStreamDisconnected() {
    clearHideBannerTimer();
    disconnectedRef.current = true;
    setStreamBannerTone("offline");
    setStreamBannerState("offline");
  }

  function markStreamConnected() {
    if (!disconnectedRef.current) return;
    clearHideBannerTimer();
    disconnectedRef.current = false;
    setStreamBannerTone("recovered");
    setStreamBannerState("recovered");
    hideBannerTimerRef.current = setTimeout(() => {
      setStreamBannerState("hidden");
      hideBannerTimerRef.current = null;
    }, 3000);
  }

  function applyStreamPayload(payload: TabletStreamPayload) {
    if (!payload.tablet) {
      resetDeviceState();
      return;
    }

    const tabletData = payload.tablet;
    setTablet(tabletData);

    if (!tabletData.is_registered) {
      setDisplayState("unregistered");
      setSession(null);
      setQrToken("");
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
      if (tabletData.reg_pin) setRegPin(tabletData.reg_pin);
      return;
    }

    const sessionData = payload.session;
    if (sessionData?.active) {
      setSession(sessionData);
      setDisplayState("active");
      if (sessionData.qr_secret && sessionData.session_id && sessionData.rotate_seconds) {
        generateQr(sessionData.qr_secret, sessionData.session_id, sessionData.rotate_seconds);
      }
    } else {
      setSession(null);
      setDisplayState("waiting");
      setQrToken("");
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    }
  }

  // ---------------------------------------------------------------------------
  // Device init and stream
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
      markStreamConnected();
    } catch {
      markStreamDisconnected();
      // retry on reconnect loop
    }
  }

  async function connectTabletStream(signal: AbortSignal) {
    while (!signal.aborted) {
      if (!deviceIdRef.current) {
        await initDevice();
      }

      const deviceId = deviceIdRef.current;
      if (!deviceId) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      const tabletSecret = displayPinRef.current ?? "";

      try {
        const response = await fetch(
          `/api/tablets/${encodeURIComponent(deviceId)}/events?tablet_secret=${encodeURIComponent(tabletSecret)}`,
          { headers: { Accept: "text/event-stream" }, signal },
        );

        if (!response.ok || !response.body) {
          throw new Error(`stream failed with status ${response.status}`);
        }
        lastStreamActivityRef.current = Date.now();
        markStreamConnected();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          lastStreamActivityRef.current = Date.now();

          buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");

          while (boundary !== -1) {
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            const data = rawEvent
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");

            if (!data) continue;

            try {
              const payload = JSON.parse(data) as TabletStreamPayload;
              applyStreamPayload(payload);

              if (payload.tablet === null) {
                try {
                  await reader.cancel();
                } catch {
                  // ignore reader cancel errors
                }
                break;
              }
            } catch {
              // ignore malformed event
            }
          }
        }
      } catch {
        if (!signal.aborted) {
          markStreamDisconnected();
        }
        // reconnect below
      }

      if (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Schedule for waiting screen
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (displayState !== "waiting" || !tablet?.building_id || !tablet?.room_id) return;

    let disposed = false;
    let lastDateKey = getLocalDateKey();

    const loadSchedule = async (dateKey: string) => {
      try {
        const response = await api.get(
          `/schedule/buildings/${tablet.building_id}/rooms/${tablet.room_id}/scheduler?date=${dateKey}`,
        );
        if (disposed) return;
        const weekday = getWeekdayFromDateKey(dateKey);
        const day = response.data.days?.find((item: { weekday: number }) => item.weekday === weekday);
        setTodayLessons(day?.lessons ?? []);
      } catch {
        if (!disposed) setTodayLessons([]);
      }
    };

    void loadSchedule(lastDateKey);

    const refreshTimer = setInterval(() => {
      void loadSchedule(getLocalDateKey());
    }, SCHEDULE_REFRESH_MS);

    const dateWatcherTimer = setInterval(() => {
      const currentDateKey = getLocalDateKey();
      if (currentDateKey === lastDateKey) return;
      lastDateKey = currentDateKey;
      void loadSchedule(currentDateKey);
    }, DATE_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(refreshTimer);
      clearInterval(dateWatcherTimer);
    };
  }, [DATE_CHECK_INTERVAL_MS, SCHEDULE_REFRESH_MS, displayState, tablet?.building_id, tablet?.room_id]);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const abortController = new AbortController();
    connectTabletStream(abortController.signal);

    return () => {
      abortController.abort();
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
      clearHideBannerTimer();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onOffline = () => markStreamDisconnected();
    const onOnline = () => {
      // Keep strip visible until stream becomes healthy again.
      lastStreamActivityRef.current = Date.now() - STREAM_STALE_MS;
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    const watchdog = setInterval(() => {
      if (navigator.onLine === false) {
        markStreamDisconnected();
        return;
      }

      const stale = Date.now() - lastStreamActivityRef.current > STREAM_STALE_MS;
      if (stale) markStreamDisconnected();
    }, 1000);

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      clearInterval(watchdog);
    };
  }, []);

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

  const isActiveMode = displayState === "active";
  const teacherPin = displayPinRef.current ?? "";
  const teacherPortalQrValue = "https://traffic.poly.hex8d.space/";
  const timeLabel = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const dateLabel = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const activeLessonIndex = useMemo(
    () => (isActiveMode ? findActiveLessonIndex(todayLessons, session?.discipline, now) : -1),
    [isActiveMode, now, session?.discipline, todayLessons],
  );

  // The display_pin used for teacher session start (stored in localStorage)
  const displayPin = teacherPin;
  const bannerVisible = streamBannerState !== "hidden";
  const bannerText =
    streamBannerTone === "recovered"
      ? "Подключение восстановлено!"
      : "Связь с сервером пропала, восстанавливаем подключение...";
  const bannerColorClass =
    streamBannerTone === "recovered"
      ? "bg-emerald-500 text-emerald-50"
      : "bg-yellow-400 text-yellow-950";
  const disconnectedStrip = (
    <div
      className={`pointer-events-none absolute left-0 top-0 z-50 w-full transform transition-transform duration-300 ease-out ${
        bannerVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className={`w-full px-3 py-3 text-center text-sm font-semibold leading-snug sm:text-base transition-colors duration-500 ${bannerColorClass}`}>
        {bannerText}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------------

  if (displayState === "unregistered") {
    return (
      <div className="relative h-screen overflow-hidden bg-background text-foreground select-none flex flex-col items-center justify-center gap-8 px-6 sm:px-8">
        {disconnectedStrip}
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

  if (displayState === "waiting" || displayState === "active") {
    const normalizedTeacherPin = displayPin.replace(/\D/g, "").slice(0, 6);
    const formattedTeacherPin =
      normalizedTeacherPin.length === 6
        ? `${normalizedTeacherPin.slice(0, 3)}-${normalizedTeacherPin.slice(3)}`
        : "—";

    return (
      <div className="relative h-screen overflow-hidden bg-background text-foreground select-none">
        {disconnectedStrip}

        <div className="h-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="grid h-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:gap-6">
            <div className="grid min-h-0 min-w-0 grid-rows-[auto_1fr] gap-4 lg:gap-6">
              <div className="rounded-3xl border border-white/10 bg-slate-800/55 p-5 text-white shadow-2xl backdrop-blur-md sm:p-6">
                <p className="text-5xl font-semibold leading-none tracking-tight tabular-nums sm:text-6xl">
                  {timeLabel}
                </p>
                <p className="mt-3 text-2xl text-white/85 sm:text-3xl">
                  {dateLabel}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-800/55 p-5 text-white shadow-2xl backdrop-blur-md sm:p-6 flex min-h-0 flex-col overflow-hidden">
                {isActiveMode ? (
                  <>
                    <div className="mx-auto flex w-full max-w-[332px] flex-col">
                      <div className="w-full rounded-2xl bg-white p-2 shadow-xl">
                        <QRCodeSVG
                          value={studentQrValue ?? "loading"}
                          size={320}
                          level="M"
                          style={{ display: "block", width: "100%", height: "auto" }}
                        />
                      </div>
                      <p className="mt-3 w-full text-left text-white/90 text-lg sm:text-xl font-medium leading-tight">
                        Отсканируй QR-код в приложении, чтобы отметиться
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mx-auto flex w-full max-w-[332px] flex-col">
                      <div className="w-full rounded-2xl bg-white p-2 shadow-xl">
                        <QRCodeSVG
                          value={teacherPortalQrValue}
                          size={320}
                          level="M"
                          style={{ display: "block", width: "100%", height: "auto" }}
                        />
                      </div>
                      <p className="mt-4 w-full text-left text-4xl font-semibold tracking-wide text-white sm:text-5xl">
                        {formattedTeacherPin}
                      </p>
                      <p className="mt-2 w-full text-left text-white/90 text-lg sm:text-xl font-medium leading-tight">
                        Код преподавателя
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="min-h-0 min-w-0 rounded-3xl border border-white/10 bg-slate-800/55 p-5 text-white shadow-2xl backdrop-blur-md sm:p-7 lg:p-8 flex flex-col">
              <div>
                <p className="text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
                  {roomLabel ?? "Аудитория не назначена"}
                </p>
                <p className="mt-2 text-white/75 text-base sm:text-lg">
                  Расписание аудитории на сегодня
                </p>
                {isActiveMode && session?.discipline && (
                  <p className="mt-3 inline-flex rounded-full border border-emerald-200/40 bg-emerald-500/20 px-3 py-1 text-sm font-medium text-emerald-100">
                    Сейчас идёт: {session.discipline}
                  </p>
                )}
              </div>

              <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                {todayLessons.length === 0 ? (
                  <p className="text-white/70 text-lg">На сегодня в расписании нет занятий.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {todayLessons.map((lesson, index) => {
                      const isCurrent = isActiveMode && index === activeLessonIndex;
                      const teacherLine = lesson.teachers?.[0]?.full_name ?? "";
                      const typeLine = lesson.typeObj?.name ?? lesson.typeObj?.abbr ?? "";
                      return (
                        <div
                          key={`${lesson.time_start}-${lesson.time_end}-${lesson.subject}-${index}`}
                          className={`grid grid-cols-[7.5rem_1fr] items-start gap-2 rounded-2xl border px-3 py-3 sm:grid-cols-[8.5rem_1fr] sm:gap-3 ${
                            isCurrent
                              ? "border-emerald-200/40 bg-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <p className="text-lg font-medium tabular-nums text-white/85 sm:text-xl">
                            {lesson.time_start}–{lesson.time_end}
                          </p>
                          <div>
                            <p className="text-xl font-semibold leading-snug sm:text-2xl">
                              {lesson.subject}
                            </p>
                            <p className="mt-1 text-base text-white/70 sm:text-lg">
                              {typeLine}
                              {teacherLine && (
                                <span className="ml-2">· {teacherLine}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
