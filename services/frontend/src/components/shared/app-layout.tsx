import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Building2,
  FileText,
  LogOut,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { auth, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path: string) => {
    if (location.pathname === path) return true;
    // /staff активна только для страниц заявок, но не для /staff/services, /staff/executors
    if (path === "/staff") return location.pathname.startsWith("/staff/applications");
    return location.pathname.startsWith(path);
  };

  const isStaffOrAdmin = isAuthenticated && auth;

  // ── Студенческий интерфейс ─────────────────────────────────────────────────
  if (!isStaffOrAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <main key={location.pathname} className="max-w-2xl mx-auto px-4 pb-6 page-enter">
          {children}
        </main>
      </div>
    );
  }

  // ── Staff / Admin интерфейс ────────────────────────────────────────────────
  const staffNav = [
    { to: "/staff", label: "Заявки", icon: FileText },
    { to: "/staff/services", label: "Услуги", icon: Settings },
    { to: "/staff/executors", label: "Исполнители", icon: Users },
  ];

  const adminNav = [
    { to: "/admin/departments", label: "Структуры", icon: Building2 },
  ];

  const executorNav = [
    { to: "/executor", label: "Заявки", icon: FileText },
  ];

  const navItems = auth.role === "admin" ? adminNav : auth.role === "executor" ? executorNav : staffNav;

  const displayName =
    auth.role === "admin" ? "Администратор" : auth.role === "executor" ? (auth.executor_name ?? "Исполнитель") : auth.department_name || "Сотрудник";

  const displayRole = auth.role === "admin" ? "Администратор" : auth.role === "executor" ? "Исполнитель" : "Сотрудник";

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6 text-primary" />
                <span className="font-bold text-lg">Уником</span>
              </Link>
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <Link key={item.to} to={item.to}>
                    <Button
                      variant={isActive(item.to) ? "secondary" : "ghost"}
                      size="sm"
                      className="gap-2"
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-right">
                <p className="font-medium">{displayName}</p>
                <p className="text-muted-foreground text-xs">{displayRole}</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
