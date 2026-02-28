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

export default function App() {
  return (
    <Routes>
      {/* Classroom screen — public, shown on tablet */}
      <Route path="/display" element={<DisplayPage />} />

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

      {/* Default */}
      <Route path="*" element={<Navigate to="/display" replace />} />
    </Routes>
  );
}
