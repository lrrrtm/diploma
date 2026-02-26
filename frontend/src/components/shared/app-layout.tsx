import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Building2,
  FileText,
  LogOut,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  const studentNav = [
    { to: "/departments", label: "Структуры", icon: Building2 },
    { to: "/applications", label: "Мои заявки", icon: FileText },
  ];

  const staffNav = [
    { to: "/staff", label: "Заявки", icon: FileText },
    { to: "/staff/services", label: "Услуги", icon: Settings },
  ];

  const adminNav = [
    { to: "/admin/departments", label: "Структуры", icon: Building2 },
    { to: "/staff", label: "Заявки", icon: FileText },
  ];

  const navItems =
    user?.role === "admin"
      ? adminNav
      : user?.role === "staff"
        ? staffNav
        : studentNav;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6 text-primary" />
                <span className="font-bold text-lg">UniComm</span>
              </Link>
              <nav className="hidden md:flex items-center gap-1">
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
                <p className="font-medium">{user?.full_name}</p>
                <p className="text-muted-foreground text-xs">
                  {user?.role === "student"
                    ? "Студент"
                    : user?.role === "staff"
                      ? "Сотрудник"
                      : "Администратор"}
                </p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <nav className="md:hidden bg-white border-b px-4 py-2 flex gap-1 overflow-x-auto">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to}>
            <Button
              variant={isActive(item.to) ? "secondary" : "ghost"}
              size="sm"
              className="gap-2 whitespace-nowrap"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Button>
          </Link>
        ))}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
