import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Users,
  Tv,
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
import { goToSSOLogin } from "@/lib/sso";

const navItems = [
  { to: "/admin/tablets", label: "Киоски", icon: Tv },
  { to: "/admin/teachers", label: "Преподаватели", icon: Users },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logout();
    goToSSOLogin();
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/admin/tablets">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <LayoutDashboard className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Политехник</span>
                    <span className="truncate text-xs text-muted-foreground">Посещаемость</span>
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
        <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
