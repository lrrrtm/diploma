import { Routes, Route, Navigate } from "react-router-dom";
import DisplayPage from "@/pages/DisplayPage";
import TeacherLoginPage from "@/pages/TeacherLoginPage";
import TeacherSessionPage from "@/pages/TeacherSessionPage";
import TeacherHistoryPage from "@/pages/TeacherHistoryPage";
import TeacherSessionDetailPage from "@/pages/TeacherSessionDetailPage";
import StudentScanPage from "@/pages/StudentScanPage";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";
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

      {/* Teacher */}
      <Route path="/teacher" element={<Navigate to="/teacher/login" replace />} />
      <Route path="/teacher/login" element={<TeacherLoginPage />} />
      <Route path="/teacher/session" element={<TeacherSessionPage />} />
      <Route path="/teacher/history" element={<TeacherHistoryPage />} />
      <Route path="/teacher/history/:sessionId" element={<TeacherSessionDetailPage />} />

      {/* Admin */}
      <Route path="/admin" element={<Navigate to="/admin/tablets" replace />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/tablets" element={<AdminTabletsPage />} />
      <Route path="/admin/tablets/register/:deviceId" element={<AdminRegisterPage />} />
      <Route path="/admin/teachers" element={<AdminTeachersPage />} />

      {/* Default */}
      <Route path="*" element={<Navigate to="/display" replace />} />
    </Routes>
  );
}
