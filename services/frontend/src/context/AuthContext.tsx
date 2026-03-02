import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { AuthInfo } from "@/types";

interface AuthContextType {
  auth: AuthInfo | null;
  token: string | null;
  refreshToken: string | null;
  loginFromToken: (token: string, refreshToken: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function parseJwtPayload(token: string): Record<string, unknown> {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthInfo | null>(() => {
    const stored = localStorage.getItem("auth");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token")
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(
    () => localStorage.getItem("refresh_token")
  );

  const loginFromToken = useCallback((token: string, refreshToken: string) => {
    const payload = parseJwtPayload(token);
    const role = payload.role as AuthInfo["role"];
    const entityId = (payload.entity_id as string | null) ?? null;
    const authInfo: AuthInfo = {
      role,
      full_name: (payload.full_name as string) ?? "",
      department_id: role === "staff" ? entityId : null,
      executor_id: role === "executor" ? entityId : null,
    };
    localStorage.setItem("token", token);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("auth", JSON.stringify(authInfo));
    setToken(token);
    setRefreshToken(refreshToken);
    setAuth(authInfo);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth");
    setToken(null);
    setRefreshToken(null);
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        auth,
        token,
        refreshToken,
        loginFromToken,
        logout,
        isAuthenticated: !!token && !!auth,
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
