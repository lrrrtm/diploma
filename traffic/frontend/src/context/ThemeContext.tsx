import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const THEMES: Theme[] = ["light", "dark", "system"];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

function getThemeFromSearchParams(): Theme | null {
  const raw = new URLSearchParams(window.location.search).get("theme");
  return isTheme(raw) ? raw : null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const fromQuery = getThemeFromSearchParams();
    if (fromQuery) {
      localStorage.setItem("theme", fromQuery);
      return fromQuery;
    }
    const stored = localStorage.getItem("theme") as Theme | null;
    return isTheme(stored) ? stored : "system";
  });

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
  };

  useEffect(() => {
    const root = document.documentElement;
    const apply = (resolved: "light" | "dark") => {
      root.classList.toggle("dark", resolved === "dark");
    };

    const resolved = theme === "system" ? getSystemTheme() : theme;
    apply(resolved);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; theme?: unknown } | null;
      if (!data || data.type !== "poly:set-theme" || !isTheme(data.theme)) return;
      setThemeState(data.theme);
      localStorage.setItem("theme", data.theme);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
