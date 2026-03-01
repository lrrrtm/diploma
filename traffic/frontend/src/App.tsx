import { useEffect, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DisplayPage from "@/pages/DisplayPage";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import TeacherSessionPage from "@/pages/TeacherSessionPage";
import TeacherHistoryPage from "@/pages/TeacherHistoryPage";
import TeacherSessionDetailPage from "@/pages/TeacherSessionDetailPage";
import StudentScanPage from "@/pages/StudentScanPage";
import AdminTabletsPage from "@/pages/admin/AdminTabletsPage";
import AdminTeachersPage from "@/pages/admin/AdminTeachersPage";
import { AdminLayout } from "@/components/shared/AdminLayout";
import { TeacherLayout } from "@/components/shared/TeacherLayout";
import { useAuth } from "@/context/AuthContext";
import { goToSSOLogin } from "@/lib/sso";

function RedirectScreen() {
  return (
    <div className="flex items-center justify-center bg-background" style={{ minHeight: "100dvh" }}>
      <p className="text-muted-foreground text-sm">Перенаправление...</p>
    </div>
  );
}

function RequireRole({ role: requiredRole, children }: { role: "admin" | "teacher"; children: ReactNode }) {
  const { isLoggedIn, role } = useAuth();

  useEffect(() => {
    if (!isLoggedIn) {
      goToSSOLogin();
      return;
    }

    if (role !== requiredRole) {
      if (role === "admin") window.location.replace("/admin/tablets");
      else if (role === "teacher") window.location.replace("/teacher/session");
      else goToSSOLogin();
    }
  }, [isLoggedIn, role, requiredRole]);

  if (!isLoggedIn || role !== requiredRole) return <RedirectScreen />;

  return <>{children}</>;
}

function RootRedirect() {
  const { isLoggedIn, role } = useAuth();
  useEffect(() => {
    if (isLoggedIn && role === "admin") window.location.replace("/admin/tablets");
    else if (isLoggedIn && role === "teacher") window.location.replace("/teacher/session");
    else goToSSOLogin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <RedirectScreen />;
}

export default function App() {
  return (
    <Routes>
      {/* Root — redirects to SSO or cabinet if already logged in */}
      <Route path="/" element={<RootRedirect />} />

      {/* Classroom screen — public, shown on kiosk */}
      <Route path="/kiosk" element={<DisplayPage />} />

      {/* Student scanner — opened in iframe from main app */}
      <Route path="/scan" element={<StudentScanPage />} />

      {/* SSO callback */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Teacher */}
      <Route path="/teacher" element={<Navigate to="/teacher/session" replace />} />
      <Route
        path="/teacher/session"
        element={<RequireRole role="teacher"><TeacherLayout><TeacherSessionPage /></TeacherLayout></RequireRole>}
      />
      <Route
        path="/teacher/history"
        element={<RequireRole role="teacher"><TeacherLayout><TeacherHistoryPage /></TeacherLayout></RequireRole>}
      />
      <Route
        path="/teacher/history/:sessionId"
        element={<RequireRole role="teacher"><TeacherLayout><TeacherSessionDetailPage /></TeacherLayout></RequireRole>}
      />

      {/* Admin — nested routes share AdminLayout + AdminDataContext */}
      <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
        <Route index element={<Navigate to="tablets" replace />} />
        <Route path="tablets" element={<AdminTabletsPage />} />
        <Route path="teachers" element={<AdminTeachersPage />} />
        <Route path="teachers/add" element={<Navigate to="/admin/teachers" replace />} />
      </Route>

      {/* Unknown paths → root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
