import axios from "axios";

const api = axios.create({ baseURL: "/api" });
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("sso_refresh_token");
  if (!refreshToken) return null;
  try {
    const response = await axios.post("/api/auth/refresh", { refresh_token: refreshToken });
    const accessToken = response.data?.access_token as string | undefined;
    const nextRefreshToken = response.data?.refresh_token as string | undefined;
    if (!accessToken || !nextRefreshToken) return null;
    localStorage.setItem("sso_token", accessToken);
    localStorage.setItem("sso_refresh_token", nextRefreshToken);
    return accessToken;
  } catch {
    localStorage.removeItem("sso_token");
    localStorage.removeItem("sso_refresh_token");
    localStorage.removeItem("sso_full_name");
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sso_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }
    const requestConfig = (error.config ?? {}) as {
      url?: string;
      headers?: Record<string, string>;
      _retry?: boolean;
      [key: string]: unknown;
    };
    const url = String(requestConfig.url ?? "");
    if (requestConfig._retry || url.includes("/auth/refresh")) {
      return Promise.reject(error);
    }
    requestConfig._retry = true;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const nextToken = await refreshPromise;
    if (!nextToken) {
      return Promise.reject(error);
    }

    requestConfig.headers = requestConfig.headers ?? {};
    requestConfig.headers.Authorization = `Bearer ${nextToken}`;
    return api(requestConfig);
  },
);

export default api;
