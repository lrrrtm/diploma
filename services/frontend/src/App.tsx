import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useStudent, useStudentLoading } from "@/context/StudentContext";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLayout } from "@/components/shared/app-layout";

import LoginPage from "@/pages/auth/LoginPage";
import DepartmentsPage from "@/pages/student/DepartmentsPage";
import DepartmentDetailPage from "@/pages/student/DepartmentDetailPage";
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

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, auth } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && auth && !allowedRoles.includes(auth.role)) {
    return <Navigate to="/" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomePage() {
  const { isAuthenticated, auth } = useAuth();
  const student = useStudent();
  const isLoading = useStudentLoading();
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
  if (student) return <Navigate to="/departments" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Guest route — login for staff/admin */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />

      {/* Home redirect */}
      <Route path="/" element={<HomePage />} />

      {/* Student routes — public, wrapped in layout */}
      <Route
        path="/departments"
        element={
          <AppLayout>
            <DepartmentsPage />
          </AppLayout>
        }
      />
      <Route
        path="/departments/:id"
        element={
          <AppLayout>
            <DepartmentDetailPage />
          </AppLayout>
        }
      />
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
