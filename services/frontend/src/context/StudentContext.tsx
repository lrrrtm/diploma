import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import type { StudentInfo } from "@/types";

const StudentContext = createContext<StudentInfo | null>(null);

function parseStudentFromSearch(search: string): StudentInfo | null {
  const params = new URLSearchParams(search);
  const id = params.get("student_id");
  const name = params.get("student_name");
  const email = params.get("student_email");
  if (id && name) {
    return { student_external_id: id, student_name: name, student_email: email || "" };
  }
  return null;
}

export function StudentProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  const [student, setStudent] = useState<StudentInfo | null>(() => {
    // При инициализации — сначала пробуем URL, потом sessionStorage
    const fromUrl = parseStudentFromSearch(window.location.search);
    if (fromUrl) {
      sessionStorage.setItem("student", JSON.stringify(fromUrl));
      return fromUrl;
    }
    const stored = sessionStorage.getItem("student");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    const fromUrl = parseStudentFromSearch(location.search);
    if (fromUrl) {
      sessionStorage.setItem("student", JSON.stringify(fromUrl));
      setStudent(fromUrl);
    }
  }, [location.search]);

  return (
    <StudentContext.Provider value={student}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent(): StudentInfo | null {
  return useContext(StudentContext);
}
