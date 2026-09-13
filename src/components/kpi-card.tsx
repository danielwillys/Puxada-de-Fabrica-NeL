import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export type KpiTone = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<KpiTone, { icon: string; value: string }> = {
  default: { icon: "bg-primary/10 text-primary", value: "" },
  success: { icon: "bg-success/10 text-success", value: "text-success" },
  warning: { icon: "bg-warning/15 text-warning", value: "text-warning" },
  danger: { icon: "bg-danger/10 text-danger", value: "text-danger" },
  info: { icon: "bg-primary/10 text-primary", value: "text-primary" },
  neutral: { icon: "bg-muted text-muted-foreground", value: "text-muted-foreground" },
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
        "group relative overflow-hidden p-4",
        onClick &&
          "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-bold tabular-nums tracking-tight",
              t.value || "text-foreground",
            )}
          >
            {value}
          </p>
          {sub ? (
            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{sub}</p>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              t.icon,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      {/* faixa decorativa inferior no tom do card */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-0.5",
          tone === "success"
            ? "bg-success/40"
            : tone === "warning"
              ? "bg-warning/50"
              : tone === "danger"
                ? "bg-danger/40"
                : tone === "info"
                  ? "bg-primary/40"
                  : "bg-primary/20",
        )}
      />
    </Card>
  );
}

