import { Badge } from "@/components/ui/badge";
import {
  ORDER_STATUS_META,
  TASK_STATUS_META,
  type OrderStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Badge variant={meta.tone} className={cn("whitespace-nowrap", className)}>
      {meta.label}
    </Badge>
  );
}

export function TaskStatusBadge({
  status,
  className,
}: {
  status: string | null;
  className?: string;
}) {
  const key = status ?? "";
  const meta = TASK_STATUS_META[key] ?? {
    label: key || "Aberta",
    tone: "neutral" as const,
  };
  return (
    <Badge variant={meta.tone} className={cn("whitespace-nowrap", className)}>
      {meta.label}
    </Badge>
  );
}
