import { type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { auth, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const isActive = (path: string) => {
    if (location.pathname === path) return true;
    if (path === "/staff") return location.pathname.startsWith("/staff/applications");
    return location.pathname.startsWith(path);
  };

  const isStaffOrAdmin = isAuthenticated && auth;

  // ── Student layout ─────────────────────────────────────────────────────────
  if (!isStaffOrAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <main key={location.pathname} className="max-w-2xl mx-auto px-4 pb-6 page-enter">
          {children}
        </main>
      </div>
    );
  }

  // ── Staff / Admin / Executor sidebar layout ────────────────────────────────
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

  const navItems =
    auth.role === "admin" ? adminNav : auth.role === "executor" ? executorNav : staffNav;

  const displayName =
    auth.full_name ||
    (auth.role === "admin" ? "Администратор" : auth.role === "executor" ? "Исполнитель" : "Сотрудник");

  const displayRole =
    auth.role === "admin"
      ? "Администратор"
      : auth.role === "executor"
        ? "Исполнитель"
        : "Сотрудник";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <LayoutDashboard className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Политехник</span>
                    <span className="truncate text-xs text-muted-foreground">Услуги</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
                <p className="text-sm font-medium leading-none truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{displayRole}</p>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <div className="flex items-center gap-1 px-2 pb-1 group-data-[collapsible=icon]:hidden">
                <Button
                  variant={theme === "light" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setTheme("light")}
                  title="Светлая тема"
                >
                  <Sun className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={theme === "system" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setTheme("system")}
                  title="Системная тема"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={theme === "dark" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setTheme("dark")}
                  title="Тёмная тема"
                >
                  <Moon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} tooltip="Выйти">
                <LogOut />
                <span>Выйти</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b border-border bg-card px-4 shrink-0">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
