import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import api from "@/api/client";
import type { AuthInfo, TokenResponse } from "@/types";

interface AuthContextType {
  auth: AuthInfo | null;
  token: string | null;
  login: (loginStr: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthInfo | null>(() => {
    const stored = localStorage.getItem("auth");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token")
  );

  const login = useCallback(
    async (loginStr: string, password: string) => {
      const { data } = await api.post<TokenResponse>("/auth/login", {
        login: loginStr,
        password,
      });
      const authInfo: AuthInfo = {
        role: data.role,
        department_id: data.department_id ?? null,
        department_name: data.department_name ?? null,
        executor_id: data.executor_id ?? null,
        executor_name: data.executor_name ?? null,
      };
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("auth", JSON.stringify(authInfo));
      setToken(data.access_token);
      setAuth(authInfo);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("auth");
    setToken(null);
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        auth,
        token,
        login,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
