import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <App />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);
