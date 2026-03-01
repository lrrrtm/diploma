import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Monitor, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import api from "@/api/client";
import { useAdminData } from "@/context/AdminDataContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface Building {
  id: number;
  name: string;
  address: string;
}

interface Room {
  id: number;
  name: string;
}

interface TabletOccupancy {
  is_registered: boolean;
  building_id: number | null;
  room_id: number | null;
}

interface ComboboxOption {
  id: number;
  label: string;
  subLabel?: string;
}

interface TabletStatusPayload {
  statuses: { tablet_id: string; online: boolean }[];
}

interface SearchableComboboxProps {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  options: ComboboxOption[];
  selectedId: number | null;
  onSelect: (optionId: number) => void;
}

function SearchableCombobox({
  label,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled = false,
  options,
  selectedId,
  onSelect,
}: SearchableComboboxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selectedOption = options.find((option) => option.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery.length === 0
    ? options
    : options.filter((option) => {
        const haystack = `${option.label} ${option.subLabel ?? ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div ref={containerRef} className="relative">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>

        {open && !disabled && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md p-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
            <div className="mt-2 max-h-44 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">{emptyText}</p>
              ) : (
                filtered.map((option) => {
                  const selected = option.id === selectedId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className="w-full flex items-start justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        onSelect(option.id);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{option.label}</span>
                        {option.subLabel && (
                          <span className="block text-xs text-muted-foreground truncate">
                            {option.subLabel}
                          </span>
                        )}
                      </span>
                      {selected && <Check className="h-4 w-4 mt-0.5 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabletStatusLight({ online }: { online: boolean }) {
  const colorClass = online ? "bg-emerald-500" : "bg-destructive";
  return (
    <span className="inline-flex items-center justify-center">
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colorClass}`}>
        <span className={`absolute inset-0 rounded-full ${colorClass} animate-ping opacity-75`} />
      </span>
      <span className="sr-only">{online ? "Онлайн" : "Оффлайн"}</span>
    </span>
  );
}

export default function AdminTabletsPage() {
  const { tablets, refresh } = useAdminData();
  const isMobile = useIsMobile();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationStep, setRegistrationStep] = useState<"otp" | "details">("otp");
  const [pin, setPin] = useState("");
  const [otpChecking, setOtpChecking] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);
  const otpWrapperRef = useRef<HTMLDivElement | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [occupiedByBuilding, setOccupiedByBuilding] = useState<Map<number, Set<number>>>(new Map());
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [tabletOnlineState, setTabletOnlineState] = useState<Record<string, boolean>>({});

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

  function resetRegistrationState() {
    setRegistrationStep("otp");
    setPin("");
    setOtpChecking(false);
    setOtpInvalid(false);
    setDeviceId(null);
    setDetailsLoading(false);
    setBuildings(null);
    setRooms(null);
    setSelectedBuilding(null);
    setSelectedRoom(null);
    setOccupiedByBuilding(new Map());
    setSavingRegistration(false);
  }

  async function loadRegistrationDetails() {
    setDetailsLoading(true);
    try {
      const [buildingsResponse, tabletsResponse] = await Promise.all([
        api.get<{ buildings: Building[] }>("/schedule/buildings"),
        api.get<TabletOccupancy[]>("/tablets/"),
      ]);

      const busyRoomsByBuilding = new Map<number, Set<number>>();
      for (const tablet of tabletsResponse.data) {
        if (tablet.is_registered && tablet.building_id !== null && tablet.room_id !== null) {
          if (!busyRoomsByBuilding.has(tablet.building_id)) {
            busyRoomsByBuilding.set(tablet.building_id, new Set());
          }
          busyRoomsByBuilding.get(tablet.building_id)!.add(tablet.room_id);
        }
      }

      setBuildings(buildingsResponse.data.buildings ?? []);
      setOccupiedByBuilding(busyRoomsByBuilding);
    } catch {
      setBuildings([]);
      setOccupiedByBuilding(new Map());
      toast.error("Не удалось загрузить корпуса");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handlePinComplete(value: string) {
    if (value.length !== 6) return;
    setOtpChecking(true);
    setOtpInvalid(false);

    try {
      const response = await api.get<{ tablet_id: string }>(`/tablets/by-reg-pin?pin=${value}`);
      setDeviceId(response.data.tablet_id);
      setRegistrationStep("details");
      setSelectedBuilding(null);
      setSelectedRoom(null);
      setRooms(null);
      await loadRegistrationDetails();
    } catch {
      setOtpInvalid(true);
      setPin("");
      requestAnimationFrame(() => {
        otpWrapperRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      });
    } finally {
      setOtpChecking(false);
    }
  }

  useEffect(() => {
    if (registrationStep !== "details" || !selectedBuilding) {
      setRooms(null);
      return;
    }

    setRooms(null);
    api
      .get<{ rooms: Room[] }>(`/schedule/buildings/${selectedBuilding.id}/rooms`)
      .then((response) => setRooms(response.data.rooms ?? []))
      .catch(() => {
        setRooms([]);
        toast.error("Не удалось загрузить аудитории");
      });
  }, [registrationStep, selectedBuilding]);

  async function handleSaveRegistration() {
    if (!deviceId || !selectedBuilding || !selectedRoom) return;
    setSavingRegistration(true);
    try {
      await api.post(`/tablets/${deviceId}/register`, {
        building_id: selectedBuilding.id,
        building_name: selectedBuilding.name,
        room_id: selectedRoom.id,
        room_name: selectedRoom.name,
      });
      toast.success("Киоск зарегистрирован");
      setRegistrationOpen(false);
      resetRegistrationState();
      refresh();
    } catch {
      toast.error("Не удалось зарегистрировать киоск");
    } finally {
      setSavingRegistration(false);
    }
  }

  const buildingOptions = useMemo<ComboboxOption[]>(
    () =>
      (buildings ?? []).map((building) => ({
        id: building.id,
        label: building.name,
        subLabel: building.address,
      })),
    [buildings]
  );

  const availableRooms = useMemo<Room[] | null>(() => {
    if (!rooms || !selectedBuilding) return rooms;
    return rooms.filter((room) => !occupiedByBuilding.get(selectedBuilding.id)?.has(room.id));
  }, [rooms, selectedBuilding, occupiedByBuilding]);

  const roomOptions = useMemo<ComboboxOption[]>(
    () => (availableRooms ?? []).map((room) => ({ id: room.id, label: `ауд. ${room.name}` })),
    [availableRooms]
  );

  const canSaveRegistration = !!deviceId && !!selectedBuilding && !!selectedRoom && !savingRegistration;
  const registered = tablets?.filter((t) => t.is_registered) ?? null;

  useEffect(() => {
    let disposed = false;
    const abortController = new AbortController();

    async function connectStatusStream() {
      while (!disposed) {
        try {
          const token = localStorage.getItem("traffic_token");
          const response = await fetch("/api/tablets/stream/statuses", {
            headers: {
              Accept: "text/event-stream",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: abortController.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error(`status stream failed: ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!disposed) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");

            while (boundary !== -1) {
              const rawEvent = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              boundary = buffer.indexOf("\n\n");

              const data = rawEvent
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("\n");

              if (!data) continue;

              try {
                const payload = JSON.parse(data) as TabletStatusPayload;
                const nextState: Record<string, boolean> = {};
                for (const status of payload.statuses ?? []) {
                  nextState[status.tablet_id] = status.online;
                }
                setTabletOnlineState(nextState);
              } catch {
                // ignore malformed event
              }
            }
          }
        } catch {
          // reconnect below
        }

        if (!disposed) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    connectStatusStream();

    return () => {
      disposed = true;
      abortController.abort();
    };
  }, []);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Киоски</h1>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={refresh} title="Обновить">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            title="Зарегистрировать"
            onClick={() => {
              resetRegistrationState();
              setRegistrationOpen(true);
            }}
          >
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
                <TableHead className="w-[38%]">UUID киоска</TableHead>
                <TableHead className="w-[12%] text-center">Статус</TableHead>
                <TableHead className="w-[18%]">Корпус</TableHead>
                <TableHead className="w-[18%]">Аудитория</TableHead>
                <TableHead className="w-[14%] text-right">Действия</TableHead>
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
                    className={isMobile ? "flex items-center justify-between gap-3 px-0 py-1" : "align-middle"}
                  >
                    {isMobile && <span className="text-xs text-muted-foreground">Статус</span>}
                    <span className={isMobile ? undefined : "flex w-full items-center justify-center"}>
                      <TabletStatusLight online={tabletOnlineState[t.id] ?? false} />
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

      <Dialog
        open={registrationOpen}
        onOpenChange={(open) => {
          setRegistrationOpen(open);
          if (!open) resetRegistrationState();
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-lg rounded-xl overflow-visible">
          <DialogHeader>
            <DialogTitle>Регистрация киоска</DialogTitle>
            <DialogDescription>
              {registrationStep === "otp"
                ? "Введите 6-значный код с экрана киоска"
                : "Выберите корпус и аудиторию для киоска"}
            </DialogDescription>
          </DialogHeader>

          {registrationStep === "otp" ? (
            <div className="space-y-4 pt-1">
              <div ref={otpWrapperRef} className="flex flex-col items-center gap-2">
                <InputOTP
                  maxLength={6}
                  value={pin}
                  onChange={(value) => {
                    setPin(value);
                    if (otpInvalid) setOtpInvalid(false);
                  }}
                  onComplete={handlePinComplete}
                  disabled={otpChecking}
                  autoFocus
                  aria-invalid={otpInvalid}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className={otpInvalid ? "border-destructive" : undefined} />
                    <InputOTPSlot index={1} className={otpInvalid ? "border-destructive" : undefined} />
                    <InputOTPSlot index={2} className={otpInvalid ? "border-destructive" : undefined} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} className={otpInvalid ? "border-destructive" : undefined} />
                    <InputOTPSlot index={4} className={otpInvalid ? "border-destructive" : undefined} />
                    <InputOTPSlot index={5} className={otpInvalid ? "border-destructive" : undefined} />
                  </InputOTPGroup>
                </InputOTP>

                {otpInvalid && (
                  <p className="text-sm text-destructive">Киоск с таким кодом не найден</p>
                )}
                {otpChecking && (
                  <p className="text-sm text-muted-foreground">Проверка кода...</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">UUID киоска</p>
                <p className="font-mono text-xs break-all mt-1">{deviceId}</p>
              </div>

              {detailsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ) : (
                <>
                  <SearchableCombobox
                    label="Корпус"
                    placeholder="Выберите корпус"
                    searchPlaceholder="Поиск корпуса..."
                    emptyText="Ничего не найдено"
                    options={buildingOptions}
                    selectedId={selectedBuilding?.id ?? null}
                    onSelect={(buildingId) => {
                      const building = buildings?.find((item) => item.id === buildingId) ?? null;
                      setSelectedBuilding(building);
                      setSelectedRoom(null);
                    }}
                  />

                  <SearchableCombobox
                    label="Аудитория"
                    placeholder={selectedBuilding ? "Выберите аудиторию" : "Сначала выберите корпус"}
                    searchPlaceholder="Поиск аудитории..."
                    emptyText={selectedBuilding ? "Нет доступных аудиторий" : "Сначала выберите корпус"}
                    options={roomOptions}
                    selectedId={selectedRoom?.id ?? null}
                    disabled={!selectedBuilding || rooms === null}
                    onSelect={(roomId) => {
                      const room = availableRooms?.find((item) => item.id === roomId) ?? null;
                      setSelectedRoom(room);
                    }}
                  />
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  disabled={!canSaveRegistration}
                  onClick={handleSaveRegistration}
                >
                  {savingRegistration ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
