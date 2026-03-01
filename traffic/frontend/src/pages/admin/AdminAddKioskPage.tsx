import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import api from "@/api/client";
import { toast } from "sonner";

export default function AdminAddKioskPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [searching, setSearching] = useState(false);

  async function handlePinComplete(value: string) {
    if (value.length !== 6) return;
    setSearching(true);
    try {
      const res = await api.get<{ tablet_id: string }>(`/tablets/by-reg-pin?pin=${value}`);
      navigate(`/admin/tablets/register/${res.data.tablet_id}`);
    } catch {
      toast.error("Киоск с таким кодом не найден");
      setPin("");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-1 mb-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="font-semibold text-sm">Регистрация киоска</p>
          <p className="text-xs text-muted-foreground">Введите код с экрана киоска</p>
        </div>
      </div>

      {/* PIN input centered on page */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Откройте /kiosk на устройстве</p>
          <p className="text-xs text-muted-foreground">и введите 6-значный код с экрана</p>
        </div>
        <InputOTP
          maxLength={6}
          value={pin}
          onChange={setPin}
          onComplete={handlePinComplete}
          disabled={searching}
          autoFocus
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
        {searching && (
          <p className="text-sm text-muted-foreground">Поиск...</p>
        )}
      </div>
    </div>
  );
}
