import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DisplayPage from "@/pages/DisplayPage";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import TeacherSessionPage from "@/pages/TeacherSessionPage";
import TeacherHistoryPage from "@/pages/TeacherHistoryPage";
import TeacherSessionDetailPage from "@/pages/TeacherSessionDetailPage";
import StudentScanPage from "@/pages/StudentScanPage";
import AdminTabletsPage from "@/pages/admin/AdminTabletsPage";
import AdminRegisterPage from "@/pages/admin/AdminRegisterPage";
import AdminTeachersPage from "@/pages/admin/AdminTeachersPage";
import { useAuth } from "@/context/AuthContext";
import { goToSSOLogin } from "@/lib/sso";

function RootRedirect() {
  const { isLoggedIn, role } = useAuth();
  useEffect(() => {
    if (isLoggedIn && role === "admin") window.location.replace("/admin/tablets");
    else if (isLoggedIn && role === "teacher") window.location.replace("/teacher/session");
    else goToSSOLogin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex items-center justify-center bg-background" style={{ minHeight: "100dvh" }}>
      <p className="text-muted-foreground text-sm">Перенаправление...</p>
    </div>
  );
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
      <Route path="/teacher/session" element={<TeacherSessionPage />} />
      <Route path="/teacher/history" element={<TeacherHistoryPage />} />
      <Route path="/teacher/history/:sessionId" element={<TeacherSessionDetailPage />} />

      {/* Admin */}
      <Route path="/admin" element={<Navigate to="/admin/tablets" replace />} />
      <Route path="/admin/tablets" element={<AdminTabletsPage />} />
      <Route path="/admin/tablets/register/:deviceId" element={<AdminRegisterPage />} />
      <Route path="/admin/teachers" element={<AdminTeachersPage />} />

      {/* Unknown paths → root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
