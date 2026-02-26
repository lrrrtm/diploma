import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import api from "@/api/client";

interface CurrentSession {
  active: boolean;
  session_id?: string;
  discipline?: string;
  qr_token?: string;
  rotate_seconds?: number;
  next_rotation_at?: number; // unix ms of next window boundary
}

export default function DisplayPage() {
  const [session, setSession] = useState<CurrentSession>({ active: false });
  const teacherUrl = `${window.location.origin}/teacher`;

  // Build student QR payload from current session
  const studentQrValue = session.active
    ? JSON.stringify({ s: session.session_id, t: session.qr_token })
    : null;

  // Fetch once on mount, then schedule next fetch exactly at the window boundary
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
            // No active session — poll every 3s waiting for teacher to start
            timerId = setTimeout(fetchSession, 3000);
          }
        })
        .catch(() => {
          timerId = setTimeout(fetchSession, 3000);
        });
    };

    fetchSession();
    return () => clearTimeout(timerId);
  }, []);

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
