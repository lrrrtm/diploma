import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronRight, ArrowLeft, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { ResponsesList } from "@/components/shared/responses-list";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
} from "@/components/ui/sheet";
import { useStudent } from "@/context/StudentContext";
import api from "@/api/client";
import type {
  ApplicationBrief,
  ApplicationDetail,
  Department,
  DepartmentWithServices,
  ServiceBrief,
} from "@/types";
import DuckScreen from "@/components/DuckScreen";
import duckAnimation from "@/assets/DUCK_PAPER_PLANE.json";

const REFRESH_INTERVAL = 5000;

// Module-level caches — survive re-renders and navigation
let applicationsCache: ApplicationBrief[] | null = null;
let deptsCache: Department[] | null = null;
const svcCache = new Map<string, ServiceBrief[]>();
let prefetchPromise: Promise<void> | null = null;
const detailCache: Record<string, ApplicationDetail> = {};

function prefetchAll(): Promise<void> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = api
    .get<Department[]>("/departments/")
    .then(async (res) => {
      deptsCache = res.data;
      await Promise.all(
        res.data.map((dept) =>
          api
            .get<DepartmentWithServices>(`/departments/${dept.id}`)
            .then((r) => {
              svcCache.set(dept.id, r.data.services.filter((s) => s.is_active));
            })
            .catch(() => {})
        )
      );
    })
    .catch(() => {
      prefetchPromise = null;
    });
  return prefetchPromise;
}

function AppCard({ app, onClick }: { app: ApplicationBrief; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">
            {new Date(app.created_at).toLocaleDateString("ru-RU")}
          </Badge>
          <StatusBadge status={app.status} />
        </div>
        <p className="font-medium leading-snug">{app.service_name}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{app.department_name}</p>
      </CardContent>
    </Card>
  );
}

type NewAppStep = "departments" | "services";

export default function ApplicationsPage() {
  const student = useStudent();
  const [applications, setApplications] = useState<ApplicationBrief[]>(applicationsCache ?? []);
  const [loading, setLoading] = useState(applicationsCache === null);
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detail sheet
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<ApplicationDetail | null>(null);

  // New application sheet
  const [newAppOpen, setNewAppOpen] = useState(false);
  const [step, setStep] = useState<NewAppStep>("departments");
  const [stepDir, setStepDir] = useState<"forward" | "back">("forward");
  const [departments, setDepartments] = useState<Department[]>(deptsCache ?? []);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [services, setServices] = useState<ServiceBrief[]>([]);

  const fetchApplications = () => {
    if (!student) return;
    api
      .get<ApplicationBrief[]>("/applications/", {
        params: { student_external_id: student.student_external_id },
      })
      .then((res) => {
        applicationsCache = res.data;
        setApplications(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    prefetchAll().then(() => {
      if (deptsCache) setDepartments(deptsCache);
    });
  }, []);

  useEffect(() => {
    if (!student) {
      setLoading(false);
      return;
    }
    fetchApplications();
    intervalRef.current = setInterval(fetchApplications, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [student]);

  const openDetail = (app: ApplicationBrief) => {
    setDetailOpen(true);
    if (detailCache[app.id]) {
      setSelectedApp(detailCache[app.id]);
      return;
    }
    setSelectedApp(null);
    setDetailLoading(true);
    api
      .get<ApplicationDetail>(`/applications/${app.id}`, {
        params: { student_external_id: student?.student_external_id },
      })
      .then((res) => {
        detailCache[app.id] = res.data;
        setSelectedApp(res.data);
      })
      .finally(() => setDetailLoading(false));
  };

  const openNewApp = async () => {
    setStep("departments");
    setSelectedDept(null);
    setServices([]);
    setNewAppOpen(true);
    if (!deptsCache) {
      await prefetchAll();
      setDepartments(deptsCache ?? []);
    }
  };

  const selectDepartment = (dept: Department) => {
    setStepDir("forward");
    setSelectedDept(dept);
    setStep("services");
    setServices(svcCache.get(dept.id) ?? []);
  };

  const goBackToDepts = () => {
    setStepDir("back");
    setStep("departments");
  };

  const selectService = (serviceId: string) => {
    setNewAppOpen(false);
    navigate(`/apply/${serviceId}`);
  };

  if (!student) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Данные студента не получены из приложения</p>
      </div>
    );
  }

  return (
    <>
      {/*
        Sticky header occupying the same row as the main-app close button.
        The close button sits at right-4 top-3 (w-8 h-8) inside the iframe,
        so we leave pr-[52px] (4px gap + 32px btn + 16px margin) on the right
        and use h-14 so both elements share the same 56px vertical band.
        -mx-4 extends the bar to the full width of the padded layout container.
      */}
      <div className="-mx-4 sticky top-0 z-10 bg-background border-b h-14 flex items-center justify-between px-4 pr-[52px]">
        <h1 className="text-lg font-semibold">Услуги</h1>
        <button
          onClick={openNewApp}
          className="h-8 px-3 flex items-center gap-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Создать
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 pt-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3 mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <DuckScreen animationData={duckAnimation} text="Заявок пока нет" />
      ) : (
        <div className="space-y-3 pt-4">
          {applications.map((app) => (
            <AppCard key={app.id} app={app} onClick={() => openDetail(app)} />
          ))}
        </div>
      )}

      {/* ── Detail sheet ─────────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {detailLoading || !selectedApp ? "\u00a0" : selectedApp.service_name}
            </SheetTitle>
            <SheetCloseButton />
          </SheetHeader>

          <div className="overflow-y-auto flex-1 px-4 py-4">
            {detailLoading || !selectedApp ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-1/2" />
                <Separator />
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-5 w-3/4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status + date */}
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={selectedApp.status} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(selectedApp.created_at).toLocaleString("ru-RU")}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground -mt-2">{selectedApp.department_name}</p>

                {/* Form data */}
                {Object.keys(selectedApp.form_data).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      {Object.entries(selectedApp.form_data).map(([key, value]) => {
                        const label =
                          selectedApp.service_fields.find((f) => f.name === key)?.label ?? key;
                        return (
                          <div key={key}>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-medium mt-0.5">{value}</p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Attachments */}
                {selectedApp.attachments.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Прикреплённые файлы
                      </p>
                      {selectedApp.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={`/uploads/${att.file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm hover:bg-secondary/80 transition-colors"
                        >
                          <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                          {att.filename}
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {/* Responses */}
                {selectedApp.responses.length > 0 && (
                  <>
                    <Separator />
                    <ResponsesList responses={selectedApp.responses} title="Ответы" />
                  </>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── New application sheet ─────────────────────────────────────── */}
      <Sheet open={newAppOpen} onOpenChange={setNewAppOpen}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center gap-2">
              {step === "services" && (
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={goBackToDepts}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <SheetTitle>
                {step === "departments"
                  ? "Выберите структуру"
                  : selectedDept?.name ?? "Выберите услугу"}
              </SheetTitle>
            </div>
            <SheetCloseButton />
          </SheetHeader>

          <div
            key={step}
            className={`overflow-y-auto flex-1 px-4 py-3 space-y-1 ${
              stepDir === "forward" ? "step-enter-forward" : "step-enter-back"
            }`}
          >
            {step === "departments" &&
              (departments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Нет доступных структур
                </p>
              ) : (
                departments.map((dept) => (
                  <button
                    key={dept.id}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-accent transition-colors text-left"
                    onClick={() => selectDepartment(dept)}
                  >
                    <span className="text-sm font-medium">{dept.name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))
              ))}

            {step === "services" &&
              (services.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Нет доступных услуг
                </p>
              ) : (
                services.map((service) => (
                  <button
                    key={service.id}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-accent transition-colors text-left"
                    onClick={() => selectService(service.id)}
                  >
                    <span className="text-sm font-medium">{service.name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
