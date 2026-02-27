import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Plus, ChevronRight, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
} from "@/components/ui/sheet";
import { useStudent } from "@/context/StudentContext";
import api from "@/api/client";
import type { ApplicationBrief, Department, DepartmentWithServices, ServiceBrief } from "@/types";
import DuckScreen from "@/components/DuckScreen";
import duckAnimation from "@/assets/DUCK_PAPER_PLANE.json";

const REFRESH_INTERVAL = 5000;
let applicationsCache: ApplicationBrief[] | null = null;

function AppCard({ app, onClick }: { app: ApplicationBrief; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{app.service_name}</span>
              <StatusBadge status={app.status} />
            </div>
            <p className="text-sm text-muted-foreground truncate">{app.department_name}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Clock className="h-3.5 w-3.5" />
            {new Date(app.created_at).toLocaleDateString("ru-RU")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type SheetStep = "departments" | "services";

export default function ApplicationsPage() {
  const student = useStudent();
  const [applications, setApplications] = useState<ApplicationBrief[]>(applicationsCache ?? []);
  const [loading, setLoading] = useState(applicationsCache === null);
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<SheetStep>("departments");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [services, setServices] = useState<ServiceBrief[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

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

  const openSheet = async () => {
    setStep("departments");
    setSelectedDept(null);
    setServices([]);
    setSheetOpen(true);
    if (departments.length === 0) {
      setDeptLoading(true);
      try {
        const res = await api.get<Department[]>("/departments/");
        setDepartments(res.data);
      } finally {
        setDeptLoading(false);
      }
    }
  };

  const selectDepartment = async (dept: Department) => {
    setSelectedDept(dept);
    setStep("services");
    setServicesLoading(true);
    try {
      const res = await api.get<DepartmentWithServices>(`/departments/${dept.id}`);
      setServices(res.data.services.filter((s) => s.is_active));
    } finally {
      setServicesLoading(false);
    }
  };

  const selectService = (serviceId: string) => {
    setSheetOpen(false);
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Мои заявки</h1>
        <Button size="sm" className="gap-1.5" onClick={openSheet}>
          <Plus className="h-4 w-4" />
          Новая заявка
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-20 shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <DuckScreen animationData={duckAnimation} text="Заявок пока нет" />
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <AppCard key={app.id} app={app} onClick={() => navigate(`/applications/${app.id}`)} />
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center gap-2">
              {step === "services" && (
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setStep("departments")}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <SheetTitle>
                {step === "departments" ? "Выберите структуру" : selectedDept?.name ?? "Выберите услугу"}
              </SheetTitle>
            </div>
            <SheetCloseButton />
          </SheetHeader>

          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1">
            {step === "departments" && (
              deptLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : departments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Нет доступных структур</p>
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
              )
            )}

            {step === "services" && (
              servicesLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Нет доступных услуг</p>
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
              )
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
