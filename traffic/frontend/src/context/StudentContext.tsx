import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import api from "@/api/client";

export interface StudentInfo {
  student_external_id: string;
  student_name: string;
  student_email: string;
}

interface StudentContextValue {
  student: StudentInfo | null;
  isLoading: boolean;
}

const StudentContext = createContext<StudentContextValue>({
  student: null,
  isLoading: false,
});

export function StudentProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<StudentInfo | null>(() => {
    const stored = sessionStorage.getItem("traffic_student");
    return stored ? JSON.parse(stored) : null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() =>
    new URLSearchParams(window.location.search).has("launch_token")
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const launchToken = params.get("launch_token");
    if (!launchToken) return;

    window.history.replaceState({}, "", window.location.pathname);

    api
      .post<StudentInfo>("/auth/verify-launch", { token: launchToken })
      .then((res) => {
        sessionStorage.setItem("traffic_student", JSON.stringify(res.data));
        sessionStorage.setItem("traffic_launch_token", launchToken);
        setStudent(res.data);
      })
      .catch(() => {
        sessionStorage.removeItem("traffic_student");
        sessionStorage.removeItem("traffic_launch_token");
        setStudent(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <StudentContext.Provider value={{ student, isLoading }}>
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
