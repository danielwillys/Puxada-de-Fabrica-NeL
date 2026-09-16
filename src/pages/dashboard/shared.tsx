import { useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoPopover } from "@/components/info-popover";
import { downloadChartPng } from "@/lib/png-export";
import type { ChartExportOptions } from "@/lib/png-export";
import { cn } from "@/lib/utils";

/** Paleta N&L usada nos gráficos (vermelho, verde e amarelo de status do BI). */
export const C = {
  primary: "#CE1E29",
  success: "#005CA8",
  warning: "#E1C333",
  danger: "#A22E2E",
  muted: "#94a3b8",
  navy: "#0F245B",
};

export const CHART_TOOLTIP = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

export function ChartCard({
  title,
  sub,
  children,
  className,
  help,
  exportName,
  exportLegend,
  stat,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
  help?: { title: string; items: { term: string; definition: string }[] };
  /** Nome do arquivo PNG; quando presente, exibe o botão de download. */
  exportName?: string;
  exportLegend?: ChartExportOptions["legend"];
  /** Percentual/resumo geral exibido no cabeçalho do card. */
  stat?: { value: string; label: string; tone?: "success" | "warning" | "danger" | "neutral" };
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {stat ? (
            <div
              className={cn(
                "rounded-md px-2 py-1 text-right",
                stat.tone === "success"
                  ? "bg-success/10"
                  : stat.tone === "warning"
                    ? "bg-warning/15"
                    : stat.tone === "danger"
                      ? "bg-danger/10"
                      : "bg-primary/10",
              )}
            >
              <p
                className={cn(
                  "text-lg font-bold tabular-nums leading-tight",
                  stat.tone === "success"
                    ? "text-success"
                    : stat.tone === "warning"
                      ? "text-warning"
                      : stat.tone === "danger"
                        ? "text-danger"
                        : "text-primary",
                )}
              >
                {stat.value}
              </p>
              <p className="max-w-[140px] truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ) : null}
          {exportName ? (
            <Button
              variant="ghost"
              size="icon"
              data-export-hide
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Baixar gráfico em PNG"
              onClick={() =>
                downloadChartPng(ref.current, {
                  filename: exportName,
                  title,
                  sub,
                  legend: exportLegend,
                })
              }
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {help ? (
            <InfoPopover title={help.title} items={help.items} className="shrink-0" />
          ) : null}
        </div>
      </div>
      <div ref={ref} className="mt-3 h-64">
        {children}
      </div>
    </Card>
  );
}

/** Card simples com título + ícone e botão de ajuda opcional. */
export function InfoCard({
  title,
  help,
  children,
  className,
}: {
  title: string;
  help?: { title: string; items: { term: string; definition: string }[] };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {help ? (
          <InfoPopover title={help.title} items={help.items} className="shrink-0" />
        ) : null}
      </div>
      {children}
    </Card>
  );
}

/** Card KPI compacto (usado nos dashboards). */
export function Kpi({
  label,
  value,
  icon: Icon,
  tone = "default",
  sub,
  onClick,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "neutral";
  sub?: string;
  onClick?: () => void;
}) {
  const toneCls: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/10 text-danger",
    info: "bg-primary/10 text-primary",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4",
        onClick &&
          "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg",
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
              toneCls[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
