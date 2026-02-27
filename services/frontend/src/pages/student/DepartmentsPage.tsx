import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import api from "@/api/client";
import type { Department } from "@/types";
import DuckScreen from "@/components/DuckScreen";
import duckAnimation from "@/assets/DUCK_PAPER_PLANE.json";

let departmentsCache: Department[] | null = null;

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>(departmentsCache ?? []);
  const [loading, setLoading] = useState(departmentsCache === null);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (departmentsCache !== null) return;
    api.get<Department[]>("/departments/").then((res) => {
      departmentsCache = res.data;
      setDepartments(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-5 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (departments.length === 0) {
    return <DuckScreen animationData={duckAnimation} text="Пока что нет доступных структур университета" />;
  }

  const filtered = query.trim()
    ? departments.filter((d) =>
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.description?.toLowerCase().includes(query.toLowerCase())
      )
    : departments;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Поиск по структурам..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <DuckScreen animationData={duckAnimation} text="Ничего не найдено" />
      ) : (
        <div className="grid gap-4">
          {filtered.map((dept) => (
            <Card
              key={dept.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/departments/${dept.id}`)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-semibold">
                  {dept.name}
                </CardTitle>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {dept.description || "Описание отсутствует"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
