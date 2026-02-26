import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
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
              <QRCodeSVG value={teacherUrl} size={320} level="M" />
            </div>
          </div>

          {/* Right: info */}
          <div className="flex-1 flex flex-col justify-center px-16 gap-6">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
              Система посещаемости
            </p>
            <h1 className="text-5xl font-bold leading-tight text-white">
              Запустите занятие
            </h1>
            <p className="text-2xl text-gray-400 leading-relaxed">
              Отсканируйте QR-код в приложении Политехник, чтобы авторизоваться и начать фиксацию посещаемости.
            </p>
            <div className="mt-4 h-px bg-gray-800" />
            <p className="text-gray-600 text-lg">
              Откройте приложение → Главная → значок QR
            </p>
          </div>
        </>
      ) : (
        /* ── Active session: student QR ── */
        <>
          {/* Left: QR */}
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white p-6 rounded-3xl shadow-2xl">
              <QRCodeSVG value={studentQrValue!} size={360} level="M" />
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
              Откройте приложение Политехник, нажмите значок QR и наведите камеру на этот экран.
            </p>
            <div className="mt-4 h-px bg-gray-800" />
            <p className="text-gray-600 text-lg">
              Код обновляется каждые {session.rotate_seconds} секунды
            </p>
          </div>
        </>
      )}
    </div>
  );
}

}
