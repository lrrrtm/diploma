import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useStudent, useStudentLoading, useWasLaunchAttempted } from "@/context/StudentContext";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLayout } from "@/components/shared/app-layout";
import DuckScreen from "@/components/DuckScreen";
import duckAnimation from "@/assets/DUCK_PAPER_PLANE.json";
import { goToSSOLogin } from "@/lib/sso";

import AuthCallbackPage from "@/pages/AuthCallbackPage";
import ServiceApplyPage from "@/pages/student/ServiceApplyPage";
import ApplicationsPage from "@/pages/student/ApplicationsPage";
import ApplicationDetailPage from "@/pages/student/ApplicationDetailPage";
import StaffDashboardPage from "@/pages/staff/StaffDashboardPage";
import StaffApplicationDetailPage from "@/pages/staff/StaffApplicationDetailPage";
import ManageServicesPage from "@/pages/staff/ManageServicesPage";
import StaffExecutorsPage from "@/pages/staff/StaffExecutorsPage";
import AdminDepartmentsPage from "@/pages/admin/AdminDepartmentsPage";
import ExecutorDashboardPage from "@/pages/executor/ExecutorDashboardPage";
import ExecutorApplicationDetailPage from "@/pages/executor/ExecutorApplicationDetailPage";

function SSORedirect() {
  useEffect(() => { goToSSOLogin(); }, []);
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <p className="text-muted-foreground text-sm">Перенаправление...</p>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, auth } = useAuth();
  if (!isAuthenticated || !auth) return <SSORedirect />;
  if (allowedRoles && !allowedRoles.includes(auth.role)) {
    return <Navigate to="/" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

function HomePage() {
  const { isAuthenticated, auth } = useAuth();
  const student = useStudent();
  const isLoading = useStudentLoading();
  const wasLaunchAttempted = useWasLaunchAttempted();
  if (isLoading) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-sm px-4 space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-4 w-2/3 mx-auto" />
      </div>
    </div>
  );
  if (isAuthenticated && auth?.role === "staff") return <Navigate to="/staff" replace />;
  if (isAuthenticated && auth?.role === "admin") return <Navigate to="/admin/departments" replace />;
  if (isAuthenticated && auth?.role === "executor") return <Navigate to="/executor" replace />;
  if (student) return <Navigate to="/applications" replace />;
  if (wasLaunchAttempted) return <DuckScreen animationData={duckAnimation} text="Эта страница открывается только через Политехник" />;
  return <SSORedirect />;
}

const TITLE_PREFIX = "Политехник.Услуги";

function resolvePageTitle(pathname: string): string {
  if (pathname === "/auth/callback") return "Авторизация";
  if (pathname === "/") return "Главная";
  if (pathname.startsWith("/apply/")) return "Подача заявки";
  if (pathname === "/applications") return "Мои заявки";
  if (pathname.startsWith("/applications/")) return "Заявка";
  if (pathname === "/staff") return "Панель сотрудника";
  if (pathname.startsWith("/staff/applications/")) return "Заявка";
  if (pathname === "/staff/services") return "Управление услугами";
  if (pathname === "/staff/executors") return "Исполнители";
  if (pathname === "/executor") return "Панель исполнителя";
  if (pathname.startsWith("/executor/applications/")) return "Заявка";
  if (pathname === "/admin/departments") return "Админка: Отделы";
  return "Главная";
}

export default function App() {
  const location = useLocation();

  useEffect(() => {
    document.title = `${TITLE_PREFIX} - ${resolvePageTitle(location.pathname)}`;
  }, [location.pathname]);

  return (
    <Routes>
      {/* SSO callback */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Home redirect */}
      <Route path="/" element={<HomePage />} />

      {/* Student routes — public, wrapped in layout */}
      <Route
        path="/apply/:serviceId"
        element={
          <AppLayout>
            <ServiceApplyPage />
          </AppLayout>
        }
      />
      <Route
        path="/applications"
        element={
          <AppLayout>
            <ApplicationsPage />
          </AppLayout>
        }
      />
      <Route
        path="/applications/:id"
        element={
          <AppLayout>
            <ApplicationDetailPage />
          </AppLayout>
        }
      />

      {/* Staff routes — protected */}
      <Route
        path="/staff"
        element={
          <ProtectedRoute allowedRoles={["staff", "admin"]}>
            <StaffDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/applications/:id"
        element={
          <ProtectedRoute allowedRoles={["staff", "admin"]}>
            <StaffApplicationDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/services"
        element={
          <ProtectedRoute allowedRoles={["staff", "admin"]}>
            <ManageServicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/executors"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <StaffExecutorsPage />
          </ProtectedRoute>
        }
      />

      {/* Executor routes */}
      <Route
        path="/executor"
        element={
          <ProtectedRoute allowedRoles={["executor"]}>
            <ExecutorDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/executor/applications/:id"
        element={
          <ProtectedRoute allowedRoles={["executor"]}>
            <ExecutorApplicationDetailPage />
          </ProtectedRoute>
        }
      />

      {/* Admin routes — protected */}
      <Route
        path="/admin/departments"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDepartmentsPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
