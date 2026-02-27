import { Routes, Route, Navigate } from "react-router-dom";
import DisplayPage from "@/pages/DisplayPage";
import TeacherLoginPage from "@/pages/TeacherLoginPage";
import TeacherSessionPage from "@/pages/TeacherSessionPage";
import StudentScanPage from "@/pages/StudentScanPage";

export default function App() {
  return (
    <Routes>
      {/* Classroom screen — public, shown on tablet/board */}
      <Route path="/display" element={<DisplayPage />} />

      {/* Teacher interface */}
      <Route path="/teacher" element={<Navigate to="/teacher/login" replace />} />
      <Route path="/teacher/login" element={<TeacherLoginPage />} />
      <Route path="/teacher/session" element={<TeacherSessionPage />} />

      {/* Student scanner — opened in iframe from main app */}
      <Route path="/scan" element={<StudentScanPage />} />

      {/* Default */}
      <Route path="*" element={<Navigate to="/display" replace />} />
    </Routes>
  );
}
