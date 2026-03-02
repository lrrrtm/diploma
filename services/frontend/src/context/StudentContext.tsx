import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { StudentInfo } from "@/types";
import api from "@/api/client";

interface StudentContextValue {
  student: StudentInfo | null;
  isLoading: boolean;
  wasLaunchAttempted: boolean;
}

const StudentContext = createContext<StudentContextValue>({ student: null, isLoading: false, wasLaunchAttempted: false });

interface VerifyLaunchResponse extends StudentInfo {
  student_token: string;
}

export function StudentProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<StudentInfo | null>(() => {
    const stored = sessionStorage.getItem("student");
    return stored ? JSON.parse(stored) : null;
  });

  // If there's a launch_token in the URL we need to verify it — start in loading state
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return new URLSearchParams(window.location.search).has("launch_token");
  });
  const [wasLaunchAttempted] = useState<boolean>(() => {
    return new URLSearchParams(window.location.search).has("launch_token") ||
      sessionStorage.getItem("student") !== null;
  });

  useEffect(() => {
    if (!sessionStorage.getItem("student_token") && sessionStorage.getItem("student")) {
      sessionStorage.removeItem("student");
      setStudent(null);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const launchToken = params.get("launch_token");
    if (!launchToken) return;

    // Clean the URL so the token isn't visible / bookmarkable
    window.history.replaceState({}, "", window.location.pathname);

    // Verify the launch token via backend
    api
      .post<VerifyLaunchResponse>("/auth/verify-launch", { token: launchToken })
      .then((res) => {
        const info: StudentInfo = {
          student_external_id: res.data.student_external_id,
          student_name: res.data.student_name,
          student_email: res.data.student_email,
        };
        sessionStorage.setItem("student", JSON.stringify(info));
        sessionStorage.setItem("student_token", res.data.student_token);
        setStudent(info);
      })
      .catch(() => {
        // Invalid or expired token — clear student context
        sessionStorage.removeItem("student");
        sessionStorage.removeItem("student_token");
        setStudent(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <StudentContext.Provider value={{ student, isLoading, wasLaunchAttempted }}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent(): StudentInfo | null {
  return useContext(StudentContext).student;
}

export function useStudentLoading(): boolean {
  return useContext(StudentContext).isLoading;
}

export function useWasLaunchAttempted(): boolean {
  return useContext(StudentContext).wasLaunchAttempted;
}
