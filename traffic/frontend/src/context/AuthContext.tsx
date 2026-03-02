import { createContext, useContext, useState, type ReactNode } from "react";
import { isTelegramMiniApp } from "@/lib/telegram";
import {
  clearAllAuth,
  clearPersistedAuth,
  setMemoryToken,
  shouldUseEphemeralTeacherSession,
} from "@/lib/auth-token";

type Role = "admin" | "teacher" | null;

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  role: Role;
  fullName: string | null;
  teacherId: string | null;
  teacherName: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, refreshToken?: string) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  refreshToken: null,
  role: null,
  fullName: null,
  teacherId: null,
  teacherName: null,
  login: () => {},
  logout: () => {},
  isLoggedIn: false,
});

function loadState(): AuthState {
  if (isTelegramMiniApp()) {
    // Telegram mini-app always reauthenticates via initData on open.
    clearPersistedAuth();
    setMemoryToken(null);
    return {
      token: null,
      refreshToken: null,
      role: null,
      fullName: null,
      teacherId: null,
      teacherName: null,
    };
  }

  const token = localStorage.getItem("traffic_token");
  setMemoryToken(token);
  return {
    token,
    refreshToken: localStorage.getItem("traffic_refresh_token"),
    role: (localStorage.getItem("traffic_role") as Role) ?? null,
    fullName: localStorage.getItem("traffic_full_name"),
    teacherId: localStorage.getItem("traffic_teacher_id"),
    teacherName: localStorage.getItem("traffic_teacher_name"),
  };
}

function parseJwtPayload(token: string): Record<string, unknown> {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadState);

  function login(token: string, refreshToken?: string) {
    const payload = parseJwtPayload(token);
    const role = (payload.role as string) as "admin" | "teacher";
    const entityId = (payload.entity_id as string | null) ?? null;
    const fullName = (payload.full_name as string) ?? "";
    const isTeacher = role === "teacher";
    const useEphemeral = shouldUseEphemeralTeacherSession(role);

    setMemoryToken(token);

    if (useEphemeral) {
      clearPersistedAuth();
    } else {
      localStorage.setItem("traffic_token", token);
      if (refreshToken) localStorage.setItem("traffic_refresh_token", refreshToken);
      else localStorage.removeItem("traffic_refresh_token");
      localStorage.setItem("traffic_role", role);
      localStorage.setItem("traffic_full_name", fullName);
      if (isTeacher && entityId) localStorage.setItem("traffic_teacher_id", entityId);
      else localStorage.removeItem("traffic_teacher_id");
      if (isTeacher) localStorage.setItem("traffic_teacher_name", fullName);
      else localStorage.removeItem("traffic_teacher_name");
    }

    setState({
      token,
      refreshToken: useEphemeral ? null : (refreshToken ?? null),
      role,
      fullName,
      teacherId: isTeacher ? entityId : null,
      teacherName: isTeacher ? fullName : null,
    });
  }

  function logout() {
    clearAllAuth();
    setState({ token: null, refreshToken: null, role: null, fullName: null, teacherId: null, teacherName: null });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isLoggedIn: !!state.token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
