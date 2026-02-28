import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import api from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { goToSSOLogin } from "@/lib/sso";
import { toast } from "sonner";

type RegStep = "building" | "room";

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

interface TabletInfo {
  id: string;
  is_registered: boolean;
  building_id: number | null;
  room_id: number | null;
}

// ---------------------------------------------------------------------------
// StepList — full-page searchable list for a step
// ---------------------------------------------------------------------------

interface StepListProps<T> {
  items: T[] | null;
  getKey: (item: T) => number;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | undefined;
  placeholder: string;
  onSelect: (item: T) => void;
}

function StepList<T>({
  items,
  getKey,
  getLabel,
  getSubLabel,
  placeholder,
  onSelect,
}: StepListProps<T>) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus search on mount (after animation)
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const filtered = items
    ? items
        .filter((item) => getLabel(item).toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => getLabel(a).localeCompare(getLabel(b), "ru", { numeric: true }))
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Sticky search bar */}
      <div className="relative shrink-0 px-4 py-3 border-b border-border bg-background">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {filtered === null ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Ничего не найдено</p>
        ) : (
          filtered.map((item) => {
            const sub = getSubLabel?.(item);
            return (
              <button
                key={getKey(item)}
                type="button"
                onClick={() => onSelect(item)}
                className="w-full text-left px-4 py-3.5 hover:bg-accent transition-colors flex flex-col gap-0.5"
              >
                <span className="text-sm font-medium">{getLabel(item)}</span>
                {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
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

  const [step, setStep] = useState<RegStep>("building");
  const [stepDir, setStepDir] = useState<"forward" | "back">("forward");

  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [occupiedByBuilding, setOccupiedByBuilding] = useState<Map<number, Set<number>>>(new Map());

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || role !== "admin") { goToSSOLogin(); return; }

    Promise.all([
      api.get<{ buildings: Building[] }>("/schedule/buildings"),
      api.get<TabletInfo[]>("/tablets/"),
    ]).then(([bRes, tRes]) => {
      setBuildings(bRes.data.buildings ?? []);
      const occupied = new Map<number, Set<number>>();
      for (const t of tRes.data) {
        if (t.is_registered && t.building_id !== null && t.room_id !== null) {
          if (!occupied.has(t.building_id)) occupied.set(t.building_id, new Set());
          occupied.get(t.building_id)!.add(t.room_id);
        }
      }
      setOccupiedByBuilding(occupied);
    }).catch(() => setBuildings([]));
  }, [isLoggedIn, role, navigate]);

  // Load rooms when building is selected
  useEffect(() => {
    if (!selectedBuilding) { setRooms(null); return; }
    setRooms(null);
    api
      .get<{ rooms: Room[] }>(`/schedule/buildings/${selectedBuilding.id}/rooms`)
      .then((r) => setRooms(r.data.rooms ?? []))
      .catch(() => setRooms([]));
  }, [selectedBuilding]);

  const selectBuilding = (b: Building) => {
    setStepDir("forward");
    setSelectedBuilding(b);
    setSelectedRoom(null);
    setStep("room");
  };

  const goBackToBuilding = () => {
    setStepDir("back");
    setStep("building");
  };

  const selectRoom = (r: Room) => {
    setSelectedRoom(r);
    setConfirmOpen(true);
  };

  const handleSave = async () => {
    if (!selectedBuilding || !selectedRoom || !deviceId) return;
    setSaving(true);
    try {
      await api.post(`/tablets/${deviceId}/register`, {
        building_id: selectedBuilding.id,
        building_name: selectedBuilding.name,
        room_id: selectedRoom.id,
        room_name: selectedRoom.name,
      });
      setConfirmOpen(false);
      setSuccess(true);
      toast.success("Аудитория назначена");
      setTimeout(() => navigate("/admin/tablets"), 1500);
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const availableRooms = rooms
    ? rooms.filter((r) => !occupiedByBuilding.get(selectedBuilding?.id ?? -1)?.has(r.id))
    : null;

  const isBack = step === "room";
  const handleBack = isBack ? goBackToBuilding : () => navigate(-1);

  const stepTitle = step === "building" ? "Выберите корпус" : "Выберите аудиторию";
  const stepSub =
    step === "room" && selectedBuilding
      ? selectedBuilding.name
      : deviceId;

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-2 py-3 flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{stepTitle}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">{stepSub}</p>
        </div>
      </div>

      {/* Step content with slide animation */}
      {success ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 step-enter-forward">
          <p className="text-green-500 font-semibold text-lg">Аудитория назначена!</p>
          <p className="text-muted-foreground text-sm">Киоск зарегистрирован и готов к работе</p>
        </div>
      ) : (
        <div
          key={step}
          className={`flex-1 overflow-hidden flex flex-col ${
            stepDir === "forward" ? "step-enter-forward" : "step-enter-back"
          }`}
        >
          {step === "building" ? (
            <StepList
              items={buildings}
              getKey={(b) => b.id}
              getLabel={(b) => b.name}
              getSubLabel={(b) => b.address || undefined}
              placeholder="Поиск корпуса..."
              onSelect={selectBuilding}
            />
          ) : (
            <StepList
              items={availableRooms}
              getKey={(r) => r.id}
              getLabel={(r) => `ауд. ${r.name}`}
              placeholder="Поиск аудитории..."
              onSelect={selectRoom}
            />
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите назначение</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 mt-1">
                <p><span className="text-foreground font-medium">Корпус:</span> {selectedBuilding?.name}</p>
                {selectedBuilding?.address && (
                  <p className="text-xs">{selectedBuilding.address}</p>
                )}
                <p><span className="text-foreground font-medium">Аудитория:</span> ауд. {selectedRoom?.name}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={saving}>
              {saving ? "Сохранение..." : "Назначить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
