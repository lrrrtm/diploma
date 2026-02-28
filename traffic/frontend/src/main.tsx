import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { StudentProvider } from "@/context/StudentContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <StudentProvider>
          <App />
        </StudentProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);
