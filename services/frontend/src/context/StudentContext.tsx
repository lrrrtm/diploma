import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { StudentInfo } from "@/types";
import api from "@/api/client";

const StudentContext = createContext<StudentInfo | null>(null);

export function StudentProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<StudentInfo | null>(() => {
    const stored = sessionStorage.getItem("student");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const launchToken = params.get("launch_token");
    if (!launchToken) return;

    // Clean the URL so the token isn't visible / bookmarkable
    window.history.replaceState({}, "", window.location.pathname);

    // Verify the launch token via backend
    api
      .post("/auth/verify-launch", { token: launchToken })
      .then((res) => {
        const info: StudentInfo = res.data;
        sessionStorage.setItem("student", JSON.stringify(info));
        setStudent(info);
      })
      .catch(() => {
        // Invalid or expired token — clear student context
        sessionStorage.removeItem("student");
        setStudent(null);
      });
  }, []);

  return (
    <StudentContext.Provider value={student}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent(): StudentInfo | null {
  return useContext(StudentContext);
}
