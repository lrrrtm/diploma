import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileText, Paperclip, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import api from "@/api/client";
import type { DepartmentWithServices } from "@/types";

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentWithServices | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<DepartmentWithServices>(`/departments/${id}`).then((res) => {
      setDepartment(res.data);
      setLoading(false);
    });
  }, [id]);

  if (loading || !department) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-2/3" /></CardHeader>
              <CardContent><Skeleton className="h-4 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const activeServices = department.services.filter((s) => s.is_active);

  return (
    <div>
      <PageHeader
        title={department.name}
        description={department.description || undefined}
        backTo="/departments"
      />

      {activeServices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Доступных услуг пока нет</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {activeServices.map((service) => (
            <Card
              key={service.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/apply/${service.id}`)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-semibold">{service.name}</CardTitle>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {service.description || "Описание отсутствует"}
                </p>
                {service.requires_attachment && (
                  <Badge variant="secondary" className="gap-1 mt-2">
                    <Paperclip className="h-3 w-3" />
                    Нужны документы
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
