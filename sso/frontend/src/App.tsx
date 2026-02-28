import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import AdminPage from "@/pages/AdminPage";
import { AdminLayout } from "@/components/shared/AdminLayout";
import { useAuth } from "@/context/AuthContext";

function ProtectedAdmin() {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/" replace />;
  return <AdminLayout><AdminPage /></AdminLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/admin" element={<ProtectedAdmin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
