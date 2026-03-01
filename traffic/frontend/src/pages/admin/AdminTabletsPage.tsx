import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import api from "@/api/client";
import { useAdminData } from "@/context/AdminDataContext";
import { toast } from "sonner";

export default function AdminTabletsPage() {
  const navigate = useNavigate();
  const { tablets, refresh } = useAdminData();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
      await api.delete(`/tablets/${pendingDeleteId}`);
      toast.success("Киоск удалён");
      refresh();
    } catch {
      toast.error("Не удалось удалить киоск");
    } finally {
      setPendingDeleteId(null);
    }
  }

  const registered = tablets?.filter((t) => t.is_registered) ?? null;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Киоски</h1>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={refresh} title="Обновить">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={() => navigate("/admin/tablets/add")} title="Зарегистрировать">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
          <p className="text-xs text-muted-foreground">Нажмите + и введите код с экрана киоска</p>
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
                  onClick={() => setPendingDeleteId(t.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Удалить этот киоск?"
        onConfirm={confirmDelete}
      />
    </>
  );
}
