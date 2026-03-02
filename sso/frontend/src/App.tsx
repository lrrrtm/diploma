import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import AdminPage from "@/pages/AdminPage";
import { AdminLayout } from "@/components/shared/AdminLayout";
import { useAuth } from "@/context/AuthContext";

function ProtectedAdmin() {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/" replace />;
  return <AdminLayout><AdminPage /></AdminLayout>;
}

const TITLE_PREFIX = "Политехник.SSO";

function resolvePageTitle(pathname: string): string {
  if (pathname === "/admin") return "Админка";
  return "Вход";
}

export default function App() {
  const location = useLocation();

  useEffect(() => {
    document.title = `${TITLE_PREFIX} - ${resolvePageTitle(location.pathname)}`;
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/admin" element={<ProtectedAdmin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
