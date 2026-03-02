import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";
import { useAdminData } from "@/context/AdminDataContext";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Login auto-generation from Russian full name (same algorithm as SSO)
// ---------------------------------------------------------------------------

const TRANS: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",
  й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",
  у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",
  э:"e",ю:"yu",я:"ya",
};

function translit(s: string): string {
  return s.toLowerCase().split("").map((c) => TRANS[c] ?? c).join("");
}

function generateLogin(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [last, ...rest] = parts;
  const lastName = translit(last).replace(/[^a-z0-9]/g, "");
  const initials = rest.map((p) => translit(p[0] ?? "").replace(/[^a-z]/g, "")).join("");
  return initials ? `${lastName}.${initials}` : lastName;
}

export default function AdminAddTeacherPage() {
  const navigate = useNavigate();
  const { refresh } = useAdminData();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "taken">("idle");
  const checkAbortRef = useRef<AbortController | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate username and check availability against SSO via backend proxy
  useEffect(() => {
    const base = generateLogin(fullName);
    if (!base) {
      setUsername("");
      setUsernameStatus("idle");
      if (checkAbortRef.current) { checkAbortRef.current.abort(); checkAbortRef.current = null; }
      return;
    }

    setUsernameStatus("checking");
    if (checkAbortRef.current) checkAbortRef.current.abort();
    const ctrl = new AbortController();
    checkAbortRef.current = ctrl;

    (async () => {
      let candidate = base;
      let suffix = 2;
      try {
        while (true) {
          const res = await api.get<{ available: boolean }>(
            `/teachers/check-username?username=${encodeURIComponent(candidate)}`,
            { signal: ctrl.signal },
          );
          if (res.data.available) {
            setUsername(candidate);
            setUsernameStatus("idle");
            return;
          }
          if (suffix > 20) break;
          candidate = `${base}${suffix++}`;
        }
        // All 20 variants taken — show base, server will reject on conflict
        setUsername(base);
        setUsernameStatus("taken");
      } catch {
        // aborted — do nothing
      }
    })();
  }, [fullName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post("/teachers/", {
        username: username.trim(),
        password: form.get("password") as string,
        full_name: fullName.trim(),
      });
      toast.success("Преподаватель создан");
      refresh();
      navigate("/admin/teachers");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Ошибка при создании");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-1 mb-6 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <p className="font-semibold text-sm">Добавить преподавателя</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">ФИО</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="Иванов Иван Иванович"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Логин</Label>
          <Input
            id="username"
            value={username}
            readOnly
            placeholder={usernameStatus === "checking" ? "Подбор логина..." : "Будет сгенерирован по ФИО"}
            className="bg-muted/40 cursor-default select-all"
          />
          {usernameStatus === "checking" && (
            <p className="text-xs text-muted-foreground">Проверка доступности...</p>
          )}
          {usernameStatus === "taken" && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">Не удалось подобрать свободный логин</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Пароль</Label>
          <InputGroup>
            <InputGroupInput
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="new-password"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-sm"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving || usernameStatus === "checking" || !username}>
            {saving ? "Создание..." : "Создать"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
