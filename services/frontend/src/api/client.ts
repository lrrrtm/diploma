import axios from "axios";
import { goToSSOLogin } from "@/lib/sso";

const api = axios.create({
  baseURL: "/api",
});
const SSO_BASE = import.meta.env.VITE_SSO_URL ?? "https://sso.poly.hex8d.space";
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;
  try {
    const response = await axios.post(`${SSO_BASE}/api/auth/refresh`, {
      refresh_token: refreshToken,
    });
    const nextToken = response.data?.access_token as string | undefined;
    const nextRefreshToken = response.data?.refresh_token as string | undefined;
    if (!nextToken || !nextRefreshToken) return null;
    localStorage.setItem("token", nextToken);
    localStorage.setItem("refresh_token", nextRefreshToken);
    return nextToken;
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth");
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const studentToken = sessionStorage.getItem("student_token");
  if (studentToken) {
    config.headers["X-Student-Token"] = studentToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const requestConfig = (error.config ?? {}) as {
        url?: string;
        headers?: Record<string, string>;
        _retry?: boolean;
        [key: string]: unknown;
      };
      if (!requestConfig._retry && !String(requestConfig.url ?? "").includes("/auth/verify-launch")) {
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
      if (path.startsWith("/staff") || path.startsWith("/admin") || path.startsWith("/executor")) {
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("auth");
        goToSSOLogin();
      } else {
        sessionStorage.removeItem("student");
        sessionStorage.removeItem("student_token");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
