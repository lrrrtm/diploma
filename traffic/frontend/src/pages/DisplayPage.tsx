import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/api/client";

interface CurrentSession {
  active: boolean;
  session_id?: string;
  discipline?: string;
  qr_token?: string;
  rotate_seconds?: number;
  next_rotation_at?: number;
}

export default function DisplayPage() {
  const [session, setSession] = useState<CurrentSession>({ active: false });
  const teacherUrl = `${window.location.origin}/teacher`;

  const studentQrValue = session.active
    ? JSON.stringify({ s: session.session_id, t: session.qr_token })
    : null;

  const handleForceClose = async () => {
    await api.post("/sessions/close-current").catch(() => {});
    setSession({ active: false });
  };

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;

    const fetchSession = () => {
      api
        .get<CurrentSession>("/sessions/current")
        .then((res) => {
          setSession(res.data);
          if (res.data.active && res.data.next_rotation_at) {
            const delay = Math.max(res.data.next_rotation_at - Date.now(), 200);
            timerId = setTimeout(fetchSession, delay);
          } else {
            timerId = setTimeout(fetchSession, 3000);
          }
        })
        .catch(() => { timerId = setTimeout(fetchSession, 3000); });
    };

    fetchSession();
    return () => clearTimeout(timerId);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-gray-950 text-white select-none flex">
      {!session.active ? (
        /* ── No session: teacher auth QR ── */
        <>
          {/* Left: QR */}
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white p-6 rounded-3xl shadow-2xl">
              <QRCodeSVG value={teacherUrl} size={640} level="M" />
            </div>
          </div>

          {/* Right: info */}
          <div className="flex-1 flex flex-col justify-center px-16 gap-6">
            <h1 className="text-5xl font-bold leading-tight text-white">
              Запустите занятие
            </h1>
            <p className="text-2xl text-gray-400 leading-relaxed">
              Отсканируйте QR-код с помощью телефона, чтобы начать фиксацию посещаемости
            </p>
          </div>
        </>
      ) : (
        /* ── Active session: student QR ── */
        <>
          {/* Left: QR */}
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white p-6 rounded-3xl shadow-2xl">
              <QRCodeSVG value={studentQrValue!} size={640} level="M" />
            </div>
          </div>

          {/* Right: info */}
          <div className="flex-1 flex flex-col justify-center px-16 gap-6">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
              Отметьте посещаемость
            </p>
            <h1 className="text-5xl font-bold leading-tight text-white break-words">
              {session.discipline}
            </h1>
            <p className="text-2xl text-gray-400 leading-relaxed">
              Открой приложение Политехник, нажми на значок QR и наведи камеру на этот экран
            </p>
            <Button
              variant="ghost"
              onClick={handleForceClose}
              className="mt-6 w-fit text-gray-600 hover:text-red-400 hover:bg-transparent"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Завершить занятие
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
