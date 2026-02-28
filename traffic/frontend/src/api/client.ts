import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("traffic_token");
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
        localStorage.removeItem("traffic_token");
        localStorage.removeItem("traffic_role");
        const isAdmin = path.startsWith("/admin");
        window.location.href = isAdmin ? "/admin/login" : "/teacher/login";
      }
    }
    return Promise.reject(err);
  },
);

export default api;
