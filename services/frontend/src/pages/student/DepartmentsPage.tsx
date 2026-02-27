import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/api/client";
import type { Department } from "@/types";
import DuckScreen from "@/components/DuckScreen";
import duckAnimation from "@/assets/DUCK_PAPER_PLANE.json";

let departmentsCache: Department[] | null = null;

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>(departmentsCache ?? []);
  const [loading, setLoading] = useState(departmentsCache === null);
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

  return (
    <div>
      {/* <PageHeader
        title="Структуры университета"
        description="Выберите структуру для получения услуги"
      /> */}

      {departments.length === 0 ? (
        <DuckScreen animationData={duckAnimation} text="Пока что нет доступных структур университета" />
      ) : (
        <div className="grid gap-4">
          {departments.map((dept) => (
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
