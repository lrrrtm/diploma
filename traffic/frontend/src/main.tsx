import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { StudentProvider } from "@/context/StudentContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <StudentProvider>
          <App />
          <Toaster position="top-right" richColors />
        </StudentProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);
