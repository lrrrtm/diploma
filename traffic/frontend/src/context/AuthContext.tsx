import { createContext, useContext, useState, type ReactNode } from "react";

type Role = "admin" | "teacher" | null;

interface AuthState {
  token: string | null;
  role: Role;
  teacherId: string | null;
  teacherName: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, role: "admin" | "teacher", teacherId?: string, teacherName?: string) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  role: null,
  teacherId: null,
  teacherName: null,
  login: () => {},
  logout: () => {},
  isLoggedIn: false,
});

function loadState(): AuthState {
  return {
    token: localStorage.getItem("traffic_token"),
    role: (localStorage.getItem("traffic_role") as Role) ?? null,
    teacherId: localStorage.getItem("traffic_teacher_id"),
    teacherName: localStorage.getItem("traffic_teacher_name"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadState);

  function login(
    token: string,
    role: "admin" | "teacher",
    teacherId?: string,
    teacherName?: string,
  ) {
    localStorage.setItem("traffic_token", token);
    localStorage.setItem("traffic_role", role);
    if (teacherId) localStorage.setItem("traffic_teacher_id", teacherId);
    else localStorage.removeItem("traffic_teacher_id");
    if (teacherName) localStorage.setItem("traffic_teacher_name", teacherName);
    else localStorage.removeItem("traffic_teacher_name");
    setState({ token, role, teacherId: teacherId ?? null, teacherName: teacherName ?? null });
  }

  function logout() {
    localStorage.removeItem("traffic_token");
    localStorage.removeItem("traffic_role");
    localStorage.removeItem("traffic_teacher_id");
    localStorage.removeItem("traffic_teacher_name");
    setState({ token: null, role: null, teacherId: null, teacherName: null });
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
