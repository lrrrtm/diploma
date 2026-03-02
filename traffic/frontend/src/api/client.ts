import axios from "axios";
import { goToSSOLogin } from "@/lib/sso";
import { clearAllAuth, getAuthToken } from "@/lib/auth-token";
import { isTelegramMiniApp } from "@/lib/telegram";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
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
