import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export type KpiTone = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<KpiTone, { icon: string; value: string }> = {
  default: { icon: "bg-primary/10 text-primary", value: "" },
  success: { icon: "bg-success/10 text-success", value: "" },
  warning: { icon: "bg-warning/15 text-warning", value: "" },
  danger: { icon: "bg-danger/10 text-danger", value: "" },
  info: { icon: "bg-primary/10 text-primary", value: "" },
  neutral: { icon: "bg-muted text-muted-foreground", value: "" },
};

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: KpiTone;
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  onClick,
  className,
}: KpiCardProps) {
  const t = TONE_CLASSES[tone];
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4",
        onClick && "cursor-pointer transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
          {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              t.icon,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
