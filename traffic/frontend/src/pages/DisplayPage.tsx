import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import api from "@/api/client";

interface CurrentSession {
  active: boolean;
  session_id?: string;
  discipline?: string;
  qr_token?: string;
  rotate_seconds?: number;
}

export default function DisplayPage() {
  const [session, setSession] = useState<CurrentSession>({ active: false });
  const teacherUrl = `${window.location.origin}/teacher`;

  // Build student QR payload from current session
  const studentQrValue = session.active
    ? JSON.stringify({ s: session.session_id, t: session.qr_token })
    : null;

  // Poll for session state and rotating token
  useEffect(() => {
    const poll = () => {
      api
        .get<CurrentSession>("/sessions/current")
        .then((res) => setSession(res.data))
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, (session.rotate_seconds ?? 10) * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.active, session.rotate_seconds]);

  return (
    <div className="h-screen overflow-hidden bg-gray-950 flex flex-col items-center justify-center gap-6 text-white select-none">
      {!session.active ? (
        <>
          <p className="text-sm text-gray-500 uppercase tracking-widest font-medium">
            Авторизация преподавателя
          </p>
          <div className="bg-white p-4 rounded-2xl shadow-2xl">
            <QRCodeSVG value={teacherUrl} size={220} level="M" />
          </div>
          <p className="text-gray-400 text-sm text-center px-8">
            Отсканируйте код в приложении, чтобы запустить занятие
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 uppercase tracking-widest font-medium">
            Отметьте посещаемость
          </p>
          <div className="bg-white p-4 rounded-2xl shadow-2xl">
            <QRCodeSVG value={studentQrValue!} size={260} level="M" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-lg">{session.discipline}</p>
            <p className="text-gray-500 text-xs mt-1">
              Код обновляется каждые {session.rotate_seconds} с
            </p>
          </div>
        </>
      )}
    </div>
  );
}
