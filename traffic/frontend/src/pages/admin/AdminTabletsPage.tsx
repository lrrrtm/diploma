import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import api from "@/api/client";
import { useAdminData } from "@/context/AdminDataContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

export default function AdminTabletsPage() {
  const navigate = useNavigate();
  const { tablets, refresh } = useAdminData();
  const isMobile = useIsMobile();
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
        <div className="rounded-lg border bg-card p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : registered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Monitor className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Нет зарегистрированных киосков</p>
          <p className="text-xs text-muted-foreground">Нажмите + и введите код с экрана киоска</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader className={isMobile ? "sr-only" : undefined}>
              <TableRow>
                <TableHead className="w-[45%]">UUID киоска</TableHead>
                <TableHead className="w-[20%]">Корпус</TableHead>
                <TableHead className="w-[20%]">Аудитория</TableHead>
                <TableHead className="w-[15%] text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registered.map((t) => (
                <TableRow
                  key={t.id}
                  className={isMobile ? "block px-3 py-2 border-b last:border-b-0" : undefined}
                >
                  <TableCell
                    className={
                      isMobile
                        ? "flex items-start justify-between gap-3 px-0 py-1"
                        : "font-mono text-xs break-all"
                    }
                  >
                    {isMobile && (
                      <span className="text-xs text-muted-foreground shrink-0">UUID</span>
                    )}
                    <span className="font-mono text-xs break-all text-right sm:text-left">
                      {t.id}
                    </span>
                  </TableCell>
                  <TableCell
                    className={isMobile ? "flex items-center justify-between gap-3 px-0 py-1" : undefined}
                  >
                    {isMobile && <span className="text-xs text-muted-foreground">Корпус</span>}
                    <span>{t.building_name ?? "—"}</span>
                  </TableCell>
                  <TableCell
                    className={isMobile ? "flex items-center justify-between gap-3 px-0 py-1" : undefined}
                  >
                    {isMobile && <span className="text-xs text-muted-foreground">Аудитория</span>}
                    <span>{t.room_name ?? "—"}</span>
                  </TableCell>
                  <TableCell
                    className={isMobile ? "flex justify-end px-0 pt-2 pb-1" : "text-right"}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDeleteId(t.id)}
                      title="Удалить киоск"
                      aria-label={`Удалить киоск ${t.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
