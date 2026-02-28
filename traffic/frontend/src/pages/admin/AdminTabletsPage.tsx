import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, Monitor, Plus, Trash2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

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
    if (!isLoggedIn || role !== "admin") { navigate("/admin/login"); return; }
    load();
  }, [isLoggedIn, role, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  function load() {
    api.get<Tablet[]>("/tablets/").then((r) => setTablets(r.data)).catch(() => setTablets([]));
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить этот планшет?")) return;
    await api.delete(`/tablets/${id}`);
    load();
  }

  const handleLogout = () => { logout(); navigate("/admin/login"); };

  return (
    <div className="h-full bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <p className="font-semibold text-sm">Планшеты</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/teachers"><Users className="h-4 w-4 mr-1.5" />Преподаватели</Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-3">
        {tablets === null ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : tablets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Monitor className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Нет зарегистрированных планшетов</p>
            <p className="text-xs text-muted-foreground">Откройте /display на планшете, чтобы он появился здесь</p>
          </div>
        ) : (
          tablets.map((t) => (
            <Card key={t.id}>
              <CardContent className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {t.is_registered ? (
                    <>
                      <p className="font-medium text-sm">{t.building_name}, ауд. {t.room_name}</p>
                      <p className="text-xs text-muted-foreground">{t.id.slice(0, 8)}…</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-sm text-amber-500">Не назначена аудитория</p>
                      <p className="text-xs text-muted-foreground">{t.id.slice(0, 8)}…</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!t.is_registered && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/admin/tablets/register/${t.id}`}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Назначить
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
