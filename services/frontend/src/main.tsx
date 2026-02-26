import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { StudentProvider } from "@/context/StudentContext";
import { Toaster } from "@/components/ui/sonner";
import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <StudentProvider>
        <App />
        <Toaster />
      </StudentProvider>
    </AuthProvider>
  </BrowserRouter>
);
