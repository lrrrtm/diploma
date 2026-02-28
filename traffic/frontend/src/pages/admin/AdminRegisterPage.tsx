import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
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

// ---------------------------------------------------------------------------
// SearchableList
// ---------------------------------------------------------------------------

interface SearchableListProps<T> {
  items: T[] | null;
  selected: T | null;
  onSelect: (item: T) => void;
  getKey: (item: T) => number;
  getLabel: (item: T) => string;
  placeholder: string;
}

function SearchableList<T>({
  items,
  selected,
  onSelect,
  getKey,
  getLabel,
  placeholder,
}: SearchableListProps<T>) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = items
    ? items
        .filter((item) => getLabel(item).toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => getLabel(a).localeCompare(getLabel(b), "ru", { numeric: true }))
    : [];

  if (items === null) return <Skeleton className="h-10 w-full rounded-md" />;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {selected && (
        <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium">
          {getLabel(selected)}
        </div>
      )}

      <div className="border border-input rounded-md overflow-y-auto max-h-56 divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-2">Ничего не найдено</p>
        ) : (
          filtered.map((item) => {
            const isSelected = selected !== null && getKey(selected) === getKey(item);
            return (
              <button
                key={getKey(item)}
                type="button"
                onClick={() => onSelect(item)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent ${
                  isSelected ? "bg-primary/10 font-medium" : ""
                }`}
              >
                {getLabel(item)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
        <div className="min-w-0">
          <p className="font-semibold text-sm">Назначить аудиторию</p>
          <p className="text-xs text-muted-foreground font-mono truncate">{deviceId}</p>
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
            <div className="space-y-1.5">
              <Label>Корпус</Label>
              <SearchableList
                items={buildings}
                selected={selectedBuilding}
                onSelect={setSelectedBuilding}
                getKey={(b) => b.id}
                getLabel={(b) => b.address ? `${b.name} — ${b.address}` : b.name}
                placeholder="Поиск корпуса..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Аудитория</Label>
              {!selectedBuilding ? (
                <p className="text-sm text-muted-foreground">Сначала выберите корпус</p>
              ) : (
                <SearchableList
                  items={rooms}
                  selected={selectedRoom}
                  onSelect={setSelectedRoom}
                  getKey={(r) => r.id}
                  getLabel={(r) => `ауд. ${r.name}`}
                  placeholder="Поиск аудитории..."
                />
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
