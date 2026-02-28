import { createContext, useContext, useState, ReactNode } from "react";

interface AuthState {
  token: string | null;
  fullName: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, fullName: string) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    token: localStorage.getItem("sso_token"),
    fullName: localStorage.getItem("sso_full_name"),
  }));

  const login = (token: string, fullName: string) => {
    localStorage.setItem("sso_token", token);
    localStorage.setItem("sso_full_name", fullName);
    setState({ token, fullName });
  };

  const logout = () => {
    localStorage.removeItem("sso_token");
    localStorage.removeItem("sso_full_name");
    setState({ token: null, fullName: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isLoggedIn: !!state.token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
