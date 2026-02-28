import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";

interface Building {
  id: number;
  name: string;
  abbr: string;
  address: string;
}

interface Room {
  id: number;
  name: string;
}

export default function AdminRegisterPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { isLoggedIn, role } = useAuth();

  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || role !== "admin") { navigate("/admin/login"); return; }
    api
      .get<{ buildings: Building[] }>("/schedule/buildings")
      .then((r) => setBuildings(r.data.buildings ?? []))
      .catch(() => setBuildings([]));
  }, [isLoggedIn, role, navigate]);

  useEffect(() => {
    if (!selectedBuilding) { setRooms(null); setSelectedRoom(null); return; }
    setRooms(null);
    setSelectedRoom(null);
    api
      .get<{ rooms: Room[] }>(`/schedule/buildings/${selectedBuilding.id}/rooms`)
      .then((r) => setRooms(r.data.rooms ?? []))
      .catch(() => setRooms([]));
  }, [selectedBuilding]);

  const handleSave = async () => {
    if (!selectedBuilding || !selectedRoom || !deviceId) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/tablets/${deviceId}/register`, {
        building_id: selectedBuilding.id,
        building_name: selectedBuilding.name,
        room_id: selectedRoom.id,
        room_name: selectedRoom.name,
      });
      setSuccess(true);
      setTimeout(() => navigate("/admin/tablets"), 1500);
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-semibold text-sm">Назначить аудиторию</p>
          <p className="text-xs text-muted-foreground">{deviceId?.slice(0, 8)}…</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full space-y-5">
        {success ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-green-500 font-semibold text-lg">Аудитория назначена!</p>
            <p className="text-muted-foreground text-sm">Планшет зарегистрирован и готов к работе</p>
          </div>
        ) : (
          <>
            {/* Building select */}
            <div className="space-y-1.5">
              <Label>Корпус</Label>
              {buildings === null ? (
                <Skeleton className="h-10 w-full rounded-md" />
              ) : (
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedBuilding?.id ?? ""}
                  onChange={(e) => {
                    const b = buildings.find((b) => b.id === Number(e.target.value)) ?? null;
                    setSelectedBuilding(b);
                  }}
                >
                  <option value="">Выберите корпус</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}{b.address ? ` — ${b.address}` : ""}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Room select */}
            <div className="space-y-1.5">
              <Label>Аудитория</Label>
              {!selectedBuilding ? (
                <p className="text-sm text-muted-foreground">Сначала выберите корпус</p>
              ) : rooms === null ? (
                <Skeleton className="h-10 w-full rounded-md" />
              ) : (
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedRoom?.id ?? ""}
                  onChange={(e) => {
                    const r = rooms.find((r) => r.id === Number(e.target.value)) ?? null;
                    setSelectedRoom(r);
                  }}
                >
                  <option value="">Выберите аудиторию</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>ауд. {r.name}</option>
                  ))}
                </select>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleSave}
              disabled={!selectedBuilding || !selectedRoom || saving}
              className="w-full"
            >
              {saving ? "Сохранение..." : "Назначить аудиторию"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
