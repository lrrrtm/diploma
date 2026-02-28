import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, Monitor, Trash2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { goToSSOLogin } from "@/lib/sso";
import { toast } from "sonner";

interface Tablet {
  id: string;
  is_registered: boolean;
  building_name: string | null;
  room_name: string | null;
  created_at: string | null;
  assigned_at: string | null;
}

export default function AdminTabletsPage() {
  const navigate = useNavigate();
  const { isLoggedIn, role, logout } = useAuth();
  const [tablets, setTablets] = useState<Tablet[] | null>(null);

  useEffect(() => {
    if (!isLoggedIn || role !== "admin") { goToSSOLogin(); return; }
    load();
  }, [isLoggedIn, role, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  function load() {
    api.get<Tablet[]>("/tablets/").then((r) => setTablets(r.data)).catch(() => setTablets([]));
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить этот киоск?")) return;
    try {
      await api.delete(`/tablets/${id}`);
      toast.success("Киоск удалён");
      load();
    } catch {
      toast.error("Не удалось удалить киоск");
    }
  }

  const handleLogout = () => { logout(); goToSSOLogin(); };

  const registered = tablets?.filter((t) => t.is_registered) ?? null;

  return (
    <div className="h-full bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <p className="font-semibold text-sm">Киоски</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/teachers"><Users className="h-4 w-4 mr-1.5" />Преподаватели</Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-5xl mx-auto w-full">
        {registered === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : registered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Monitor className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Нет зарегистрированных киосков</p>
            <p className="text-xs text-muted-foreground">Откройте /display на киоске и отсканируйте QR</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {registered.map((t) => (
              <Card key={t.id}>
                <CardContent className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{t.building_name}, ауд. {t.room_name}</p>
                    <p className="text-xs text-muted-foreground font-mono break-all">{t.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
