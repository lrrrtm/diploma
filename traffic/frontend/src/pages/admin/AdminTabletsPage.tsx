import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
  const { isLoggedIn, role } = useAuth();
  const [tablets, setTablets] = useState<Tablet[] | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || role !== "admin") { goToSSOLogin(); return; }
    load();
  }, [isLoggedIn, role]); // eslint-disable-line react-hooks/exhaustive-deps

  function load() {
    api.get<Tablet[]>("/tablets/").then((r) => setTablets(r.data)).catch(() => setTablets([]));
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
      await api.delete(`/tablets/${pendingDeleteId}`);
      toast.success("Киоск удалён");
      load();
    } catch {
      toast.error("Не удалось удалить киоск");
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handlePinComplete(value: string) {
    if (value.length !== 6) return;
    setSearching(true);
    try {
      const res = await api.get<{ tablet_id: string }>(`/tablets/by-reg-pin?pin=${value}`);
      setPinDialogOpen(false);
      setPin("");
      navigate(`/admin/tablets/register/${res.data.tablet_id}`);
    } catch {
      toast.error("Киоск с таким кодом не найден");
      setPin("");
    } finally {
      setSearching(false);
    }
  }

  const registered = tablets?.filter((t) => t.is_registered) ?? null;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Киоски</h1>
        <Button size="sm" onClick={() => { setPin(""); setPinDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Зарегистрировать
        </Button>
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
          <p className="text-xs text-muted-foreground">Нажмите «Зарегистрировать» и введите код с экрана киоска</p>
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

      {/* PIN entry dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={(o) => { setPinDialogOpen(o); if (!o) setPin(""); }}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-lg max-w-sm">
          <DialogHeader>
            <DialogTitle>Введите код киоска</DialogTitle>
            <DialogDescription>
              Откройте /kiosk на киоске и введите 6-значный код с экрана
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <InputOTP
              maxLength={6}
              value={pin}
              onChange={setPin}
              onComplete={handlePinComplete}
              disabled={searching}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          {searching && (
            <p className="text-sm text-muted-foreground text-center -mt-2 pb-2">Поиск...</p>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Удалить этот киоск?"
        onConfirm={confirmDelete}
      />
    </>
  );
}
