import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function parseJwtPayload(token: string): Record<string, unknown> {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64));
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      navigate("/display", { replace: true });
      return;
    }

    window.history.replaceState({}, "", window.location.pathname);
    login(token);

    const payload = parseJwtPayload(token);
    const role = payload.role as string;
    if (role === "admin") {
      navigate("/admin/tablets", { replace: true });
    } else if (role === "teacher") {
      navigate("/teacher/session", { replace: true });
    } else {
      navigate("/display", { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <p className="text-muted-foreground text-sm">Выполняется вход...</p>
    </div>
  );
}
