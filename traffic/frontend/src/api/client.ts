import axios from "axios";
import { goToSSOLogin } from "@/lib/sso";
import { clearAllAuth, getAuthToken, getRefreshToken, setMemoryToken } from "@/lib/auth-token";
import { isTelegramMiniApp } from "@/lib/telegram";

const api = axios.create({ baseURL: "/api" });
const SSO_BASE = import.meta.env.VITE_SSO_URL ?? "https://sso.poly.hex8d.space";
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (isTelegramMiniApp()) return null;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await axios.post(`${SSO_BASE}/api/auth/refresh`, {
      refresh_token: refreshToken,
    });
    const nextToken = response.data?.access_token as string | undefined;
    const nextRefreshToken = response.data?.refresh_token as string | undefined;
    if (!nextToken || !nextRefreshToken) return null;
    localStorage.setItem("traffic_token", nextToken);
    localStorage.setItem("traffic_refresh_token", nextRefreshToken);
    setMemoryToken(nextToken);
    return nextToken;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      const requestConfig = (err.config ?? {}) as {
        url?: string;
        headers?: Record<string, string>;
        _retry?: boolean;
        [key: string]: unknown;
      };
      if (!requestConfig._retry && !String(requestConfig.url ?? "").includes("/auth/telegram-login")) {
        requestConfig._retry = true;
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const nextToken = await refreshPromise;
        if (nextToken) {
          requestConfig.headers = requestConfig.headers ?? {};
          requestConfig.headers.Authorization = `Bearer ${nextToken}`;
          return api(requestConfig);
        }
      }

      const path = window.location.pathname;
      if (path.startsWith("/teacher") || path.startsWith("/admin")) {
        clearAllAuth();
        if (path.startsWith("/teacher") && isTelegramMiniApp()) {
          window.location.replace("/teacher/session");
        } else {
          goToSSOLogin();
        }
      }
    }
    return Promise.reject(err);
  },
);

export default api;
