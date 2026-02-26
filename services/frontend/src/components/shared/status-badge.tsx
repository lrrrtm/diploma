import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@/types";

const statusConfig: Record<
  ApplicationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "warning" | "success" }
> = {
  pending: { label: "Ожидает", variant: "warning" },
  in_progress: { label: "В обработке", variant: "default" },
  completed: { label: "Выполнено", variant: "success" },
  rejected: { label: "Отклонено", variant: "destructive" },
};

interface StatusBadgeProps {
  status: ApplicationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
