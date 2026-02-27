import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ScanLine } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";

export default function TeacherLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const username = (form.get("username") as string).trim();
    const password = form.get("password") as string;
    if (!username) { setError("Введите логин"); return; }

    setLoading(true);
    try {
      const res = await api.post<{ access_token: string; teacher_name: string }>(
        "/auth/teacher-login",
        { username, password }
      );
      localStorage.setItem("teacher_token", res.data.access_token);
      localStorage.setItem("teacher_name", res.data.teacher_name);
      navigate("/teacher/session");
    } catch {
      setError("Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <ScanLine className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-muted-foreground text-xl font-light select-none">×</span>
            <img src="/polytech_logo.svg" alt="СПбПУ" className="h-11 w-11" />
          </div>
          <CardTitle className="text-2xl">Политехник.Посещаемость</CardTitle>
          <CardDescription>Контроль посещаемости студентов</CardDescription>
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
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
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
