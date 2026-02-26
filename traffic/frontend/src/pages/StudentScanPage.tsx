import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { CheckCircle, QrCode, XCircle } from "lucide-react";
import { useStudent, useStudentLoading } from "@/context/StudentContext";
import api from "@/api/client";

type ScanState = "idle" | "scanning" | "success" | "error" | "already";

export default function StudentScanPage() {
  const student = useStudent();
  const loading = useStudentLoading();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Start camera once student is confirmed
  useEffect(() => {
    if (loading || !student || scanState !== "idle") return;

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    const startScanning = async () => {
      if (!videoRef.current) return;
      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          videoRef.current,
          async (result, _err, c) => {
            if (!result) return;
            c.stop();
            setScanState("scanning");
            try {
              const payload = JSON.parse(result.getText()) as { s: string; t: string };
              const res = await api.post<{ status: string; message: string }>(
                `/sessions/${payload.s}/attend`,
                {
                  qr_token: payload.t,
                  student_external_id: student.student_external_id,
                  student_name: student.student_name,
                  student_email: student.student_email,
                }
              );
              if (res.data.status === "already_marked") {
                setScanState("already");
              } else {
                setScanState("success");
              }
              setMessage(res.data.message);
            } catch (err: unknown) {
              setScanState("error");
              const msg =
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
                "Не удалось отметить посещаемость";
              setMessage(msg);
            }
          }
        );
        controlsRef.current = controls;
      } catch {
        setCameraError("Нет доступа к камере. Разреши использование камеры в настройках браузера.");
      }
    };

    startScanning();

    return () => {
      controlsRef.current?.stop();
    };
  }, [loading, student, scanState]);

  const handleRetry = () => {
    setScanState("idle");
    setMessage(null);
  };

  // Loading while verifying launch token
  if (loading) {
    return (
      <div className="h-full overflow-hidden flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // No student identity
  if (!student) {
    return (
      <div className="h-full overflow-hidden flex flex-col items-center justify-center bg-gray-50 px-6 text-center gap-4">
        <QrCode className="h-12 w-12 text-gray-300" />
        <p className="font-semibold text-gray-700">Открой через Политехник</p>
        <p className="text-sm text-gray-400">
          Эта страница открывается через кнопку в приложении суперапп
        </p>
      </div>
    );
  }

  // Camera error
  if (cameraError) {
    return (
      <div className="h-full overflow-hidden flex flex-col items-center justify-center bg-gray-50 px-6 text-center gap-4">
        <XCircle className="h-12 w-12 text-red-400" />
        <p className="text-sm text-gray-600">{cameraError}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-black relative">
      {/* Camera feed — fullscreen */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: scanState === "idle" ? "block" : "none" }}
        muted
        playsInline
      />

      {/* QR viewfinder overlay */}
      {scanState === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {/* Semi-transparent dimming outside the frame */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Viewfinder box */}
          <div className="relative z-10 w-64 h-64">
            {/* Clear "hole" */}
            <div className="absolute inset-0 bg-transparent" />

            {/* Corner brackets */}
            {/* Top-left */}
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
            {/* Top-right */}
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
            {/* Bottom-left */}
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
            {/* Bottom-right */}
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
          </div>

          {/* Instruction text */}
          <div className="relative z-10 mt-8 text-center px-6">
            <p className="text-white text-sm font-medium drop-shadow">
              Наведи камеру на QR-код на экране
            </p>
            <p className="text-gray-300 text-xs mt-1 drop-shadow">{student.student_name}</p>
          </div>
        </div>
      )}

      {scanState === "scanning" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {(scanState === "success" || scanState === "already") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-4 px-6 text-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
          <p className="text-lg font-bold text-gray-900">{message}</p>
          <p className="text-sm text-gray-500">{student.student_name}</p>
        </div>
      )}

      {scanState === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-4 px-6 text-center">
          <XCircle className="h-16 w-16 text-red-400" />
          <p className="text-base font-semibold text-gray-900">{message}</p>
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      )}
    </div>
  );
}
