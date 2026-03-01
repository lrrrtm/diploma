import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Building2,
  FileText,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useTheme, type Theme } from "@/context/ThemeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { goToSSOLogin } from "@/lib/sso";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Светлая", icon: Sun },
  { value: "system", label: "Системная", icon: Monitor },
  { value: "dark", label: "Тёмная", icon: Moon },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { auth, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const [profileOpen, setProfileOpen] = useState(false);

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

  // ── Staff / Admin / Executor layout ──────────────────────────────────────
  const handleLogout = () => {
    logout();
    goToSSOLogin();
  };

  const isActive = (path: string) => {
    if (location.pathname === path) return true;
    if (path === "/staff") return location.pathname.startsWith("/staff/applications");
    return location.pathname.startsWith(path);
  };

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

  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const profileContent = (
    <div className="px-4 pt-6 pb-8">
      <div className="flex flex-col items-center mb-5 gap-1.5">
        <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
          <span className="text-xl font-bold text-primary-foreground select-none">
            {initials}
          </span>
        </div>
        <p className="text-base font-semibold text-foreground text-center mt-1">
          {displayName}
        </p>
        <p className="text-sm text-muted-foreground text-center">
          {displayRole}
        </p>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-foreground mb-2">
          Тема оформления
        </p>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                theme === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        className="mt-6 w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-red-900 dark:hover:bg-red-950"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Выйти
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top bar — desktop only */}
      {!isMobile && (
        <header className="flex items-center gap-2 border-b border-border bg-card px-4 h-12 shrink-0">
          <nav className="flex-1 overflow-x-auto flex gap-1 min-w-0 no-scrollbar">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
                  isActive(item.to)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setProfileOpen(true)}
            className="rounded-xl bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary shrink-0"
            title="Профиль"
          >
            <User className="h-5 w-5" />
          </Button>
        </header>
      )}

      {/* Content */}
      <main className={cn("flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full", isMobile && "pb-24")}>
        {children}
      </main>

      {/* Bottom nav — mobile only */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40">
          <div className="flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors",
                  isActive(to) ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ))}
            <button
              onClick={() => setProfileOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <User className="h-5 w-5" />
              Профиль
            </button>
          </div>
        </nav>
      )}

      {/* Profile — Sheet on mobile, Dialog on desktop */}
      {isMobile ? (
        <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
          <SheetContent side="bottom" className="p-0 rounded-t-2xl">
            <SheetTitle className="sr-only">Профиль</SheetTitle>
            {profileContent}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-sm p-0">
            <DialogTitle className="sr-only">Профиль</DialogTitle>
            {profileContent}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
