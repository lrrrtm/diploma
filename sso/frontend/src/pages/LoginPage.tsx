import { useState, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

const APP_LABELS: Record<string, string> = {
  services: "Заявки на услуги",
  traffic: "Посещаемость",
  sso: "Панель управления SSO",
};

export default function LoginPage() {
  const [params] = useSearchParams();
  const app = params.get("app") ?? "sso";
  const redirectTo = params.get("redirect_to") ?? null;

  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appLabel = APP_LABELS[app] ?? app;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const { data } = await api.post("/auth/login", {
        username: form.get("username"),
        password: form.get("password"),
        app,
        redirect_to: redirectTo,
      });

      // If the user is SSO admin, store token and redirect to admin panel
      if (data.app === "sso" && data.role === "admin") {
        login(data.access_token, data.full_name);
        if (redirectTo) {
          window.location.href = `${redirectTo}?token=${encodeURIComponent(data.access_token)}`;
        } else {
          window.location.href = "/admin";
        }
        return;
      }

      // For app users — redirect back to their app with the token
      if (redirectTo) {
        window.location.href = `${redirectTo}?token=${encodeURIComponent(data.access_token)}`;
      } else {
        // No redirect — just show success (shouldn't normally happen)
        login(data.access_token, data.full_name);
        window.location.href = "/";
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Ошибка входа";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Политехник</CardTitle>
          <CardDescription>
            Вход в <span className="font-medium text-foreground">{appLabel}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Логин</Label>
              <Input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Вход..." : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
