import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "@/api/client";

export interface Tablet {
  id: string;
  is_registered: boolean;
  building_name: string | null;
  room_name: string | null;
  created_at: string | null;
  assigned_at: string | null;
}

export interface Teacher {
  id: string;
  username: string;
  full_name: string;
  created_at: string | null;
}

interface AdminDataContextValue {
  tablets: Tablet[] | null;
  teachers: Teacher[] | null;
  refresh: () => void;
}

const AdminDataContext = createContext<AdminDataContextValue>({
  tablets: null,
  teachers: null,
  refresh: () => {},
});

export function useAdminData() {
  return useContext(AdminDataContext);
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [tablets, setTablets] = useState<Tablet[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);

  const refresh = useCallback(() => {
    setTablets(null);
    setTeachers(null);
    // Minimum 1.5s skeleton so fast responses don't flash
    const delay = new Promise<void>((r) => setTimeout(r, 1500));
    Promise.all([api.get<Tablet[]>("/tablets/"), delay])
      .then(([r]) => setTablets(r.data))
      .catch(() => setTablets([]));
    Promise.all([api.get<Teacher[]>("/teachers/"), delay])
      .then(([r]) => setTeachers(r.data))
      .catch(() => setTeachers([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AdminDataContext.Provider value={{ tablets, teachers, refresh }}>
      {children}
    </AdminDataContext.Provider>
  );
}
