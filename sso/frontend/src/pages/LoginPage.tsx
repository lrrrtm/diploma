import { useState, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, FileText, ClipboardList, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

const APP_ICONS: Record<string, React.ElementType> = {
  services: FileText,
  traffic: ClipboardList,
  sso: ShieldCheck,
};

export default function LoginPage() {
  const [params] = useSearchParams();
  const app = params.get("app") ?? "sso";
  const redirectTo = params.get("redirect_to") ?? null;

  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const appLabel = params.get("app_name") ?? (app === "sso" ? "Политехник.SSO" : app);
  const AppIcon = APP_ICONS[app] ?? ShieldCheck;

  const buildRedirectWithTokens = (targetUrl: string, accessToken: string, refreshToken: string): string => {
    const target = new URL(targetUrl, window.location.origin);
    const hash = new URLSearchParams({
      token: accessToken,
      refresh_token: refreshToken,
    });
    target.hash = hash.toString();
    return target.toString();
  };

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
        login(data.access_token, data.refresh_token, data.full_name);
        if (redirectTo) {
          window.location.replace(buildRedirectWithTokens(redirectTo, data.access_token, data.refresh_token));
        } else {
          window.location.replace("/admin");
        }
        return;
      }

      // For app users — redirect back to their app with the token
      if (redirectTo) {
        window.location.replace(buildRedirectWithTokens(redirectTo, data.access_token, data.refresh_token));
      } else {
        // No redirect — just show success (shouldn't normally happen)
        login(data.access_token, data.refresh_token, data.full_name);
        window.location.replace("/");
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
    <div className="flex items-center justify-center bg-background px-4 py-6" style={{ minHeight: "100dvh" }}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="/polytech_logo.svg" alt="СПбПУ" className="h-11 w-11" />
            <span className="text-muted-foreground text-xl font-light select-none">×</span>
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <AppIcon className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">{appLabel}</CardTitle>
          <CardDescription>Единый вход в систему</CardDescription>
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
              <InputGroup>
                <InputGroupInput
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-sm" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
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
