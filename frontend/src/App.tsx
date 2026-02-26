import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/shared/app-layout";

import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import DepartmentsPage from "@/pages/student/DepartmentsPage";
import DepartmentDetailPage from "@/pages/student/DepartmentDetailPage";
import ServiceApplyPage from "@/pages/student/ServiceApplyPage";
import ApplicationsPage from "@/pages/student/ApplicationsPage";
import ApplicationDetailPage from "@/pages/student/ApplicationDetailPage";
import StaffDashboardPage from "@/pages/staff/StaffDashboardPage";
import StaffApplicationDetailPage from "@/pages/staff/StaffApplicationDetailPage";
import ManageServicesPage from "@/pages/staff/ManageServicesPage";
import AdminDepartmentsPage from "@/pages/admin/AdminDepartmentsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomePage() {
  const { user } = useAuth();
  if (user?.role === "staff") return <Navigate to="/staff" replace />;
  if (user?.role === "admin") return <Navigate to="/admin/departments" replace />;
  return <Navigate to="/departments" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Guest routes */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />

      {/* Student routes */}
      <Route
        path="/departments"
        element={
          <ProtectedRoute>
            <DepartmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/departments/:id"
        element={
          <ProtectedRoute>
            <DepartmentDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/apply/:serviceId"
        element={
          <ProtectedRoute>
            <ServiceApplyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <ProtectedRoute>
            <ApplicationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/applications/:id"
        element={
          <ProtectedRoute>
            <ApplicationDetailPage />
          </ProtectedRoute>
        }
      />

      {/* Staff routes */}
      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <StaffDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/applications/:id"
        element={
          <ProtectedRoute>
            <StaffApplicationDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/services"
        element={
          <ProtectedRoute>
            <ManageServicesPage />
          </ProtectedRoute>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin/departments"
        element={
          <ProtectedRoute>
            <AdminDepartmentsPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
