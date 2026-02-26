import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
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
        <div className="grid gap-4 md:grid-cols-2">
          {activeServices.map((service) => (
            <Card key={service.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                  {service.requires_attachment && (
                    <Badge variant="secondary" className="gap-1">
                      <Paperclip className="h-3 w-3" />
                      Нужны документы
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {service.description || "Описание отсутствует"}
                </p>
                <Button
                  className="w-full"
                  onClick={() => navigate(`/apply/${service.id}`)}
                >
                  Подать заявку
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
