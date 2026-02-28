import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudent, useStudentLoading } from "@/context/StudentContext";
import api from "@/api/client";
import duckAnimation from "../assets/DUCK_PAPER_PLANE.json";
import duckInnerAnimation from "../assets/DUCK_INNER.json";
import DuckScreen from "@/components/DuckScreen";

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
              const launchToken = sessionStorage.getItem("traffic_launch_token") ?? "";
              const res = await api.post<{ status: string; message: string }>(
                `/sessions/${payload.s}/attend`,
                {
                  qr_token: payload.t,
                  launch_token: launchToken,
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
      <div className="h-full overflow-hidden flex flex-col items-center justify-center bg-background gap-4 px-4">
        <Skeleton className="h-64 w-64 rounded-xl" />
        <Skeleton className="h-5 w-48" />
      </div>
    );
  }

  // No student identity
  if (!student) {
    return <DuckScreen animationData={duckAnimation} text="Эта страница открывается только через Политехник" />;
  }

  // Camera error
  if (cameraError) {
    return <DuckScreen animationData={duckInnerAnimation} text="Выдай разрешение для использования камеры" />;
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
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
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
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {(scanState === "success" || scanState === "already") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 dark:text-green-400" />
          <p className="text-lg font-bold text-foreground">{message}</p>
          <p className="text-sm text-muted-foreground">{student.student_name}</p>
        </div>
      )}

      {scanState === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
          <XCircle className="h-16 w-16 text-destructive" />
          <p className="text-base font-semibold text-foreground">{message}</p>
          <Button onClick={handleRetry}>
            Попробовать снова
          </Button>
        </div>
      )}
    </div>
  );
}
