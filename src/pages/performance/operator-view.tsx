import { useMemo } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoPopover } from "@/components/info-popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useOperators,
  usePerformanceTasks,
  useSettings,
  useShifts,
  type GlobalFilters,
} from "@/lib/queries";
import { buildOperatorSummaries, type OperatorSummary } from "@/lib/performance";
import { fmtDurationMinutes, fmtInt, fmtPercent, fmtQty } from "@/lib/format";

function OpRow({ o }: { o: OperatorSummary }) {
  return (
    <TableRow key={String(o.operatorId)}>
      <TableCell className="font-medium">{o.name}</TableCell>
      <TableCell>
        <Badge variant="secondary">{o.shiftCode}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{fmtInt(o.pulls)}</TableCell>
      <TableCell className="tabular-nums">{fmtQty(o.pullQty)}</TableCell>
      <TableCell className="tabular-nums">{fmtInt(o.stores)}</TableCell>
      <TableCell className="tabular-nums">{fmtQty(o.storeQty)}</TableCell>
      <TableCell className="tabular-nums">{fmtDurationMinutes(o.avgMinutes)}</TableCell>
      <TableCell className="tabular-nums">{fmtDurationMinutes(o.p90Minutes)}</TableCell>
      <TableCell>
        {o.slaPct === null ? (
          "—"
        ) : (
          <Badge
            variant={
              o.slaPct >= 90 ? "success" : o.slaPct >= 60 ? "warning" : "danger"
            }
          >
            {fmtPercent(o.slaPct)}
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export function OperatorPerformanceView({ filters }: { filters: GlobalFilters }) {
  const tasks = usePerformanceTasks(filters);
  const operators = useOperators();
  const shifts = useShifts();
  const settings = useSettings();

  const slaMinutes = useMemo(() => {
    const row = (settings.data ?? []).find((s) => s.key === "storage_sla_minutes");
    const v = row?.value;
    const n = typeof v === "number" ? v : Number(v ?? 30);
    return Number.isFinite(n) && n > 0 ? n : 30;
  }, [settings.data]);

  const shiftInputs = useMemo(
    () =>
      (shifts.data ?? [])
        .filter((s) => s.active)
        .map((s) => ({ id: s.id, code: s.code, name: s.name })),
    [shifts.data],
  );

  const opInputs = useMemo(
    () =>
      (operators.data ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        role: o.role ?? null,
      })),
    [operators.data],
  );

  const rows = useMemo(
    () => buildOperatorSummaries(tasks.data ?? [], opInputs, shiftInputs, slaMinutes),
    [tasks.data, opInputs, shiftInputs, slaMinutes],
  );

  const totals = useMemo(() => {
    const t = {
      pulls: 0,
      pullQty: 0,
      stores: 0,
      storeQty: 0,
      pairs: 0,
      minutesSum: 0,
    };
    for (const r of rows) {
      t.pulls += r.pulls;
      t.pullQty += r.pullQty;
      t.stores += r.stores;
      t.storeQty += r.storeQty;
      t.pairs += r.pairs;
      if (r.avgMinutes !== null) t.minutesSum += r.avgMinutes * r.pairs;
    }
    return { ...t, avgMinutes: t.pairs > 0 ? t.minutesSum / t.pairs : null };
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((r) => r.pulls + r.stores + r.pairs > 0),
    [rows],
  );

  if (tasks.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Kpi label="Operadores com movimentação" value={fmtInt(filtered.length)} icon={ArrowUpFromLine} />
        <Kpi label="Puxadas" value={fmtInt(totals.pulls)} icon={ArrowUpFromLine} tone="info" />
        <Kpi label="Armazenagens" value={fmtInt(totals.stores)} icon={ArrowDownToLine} tone="success" />
        <Kpi label="Qtd movimentada" value={fmtQty(totals.pullQty + totals.storeQty)} icon={Timer} />
        <Kpi
          label="Tempo médio puxada→armazenagem"
          value={fmtDurationMinutes(totals.avgMinutes)}
          icon={Timer}
          sub={`P90 disponível por operador (SLA ${slaMinutes} min)`}
        />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            Desempenho por operador
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Puxadas (1020, autor) e armazenagens (1012, confirmado por) — separadas
            </span>
          </p>
          <InfoPopover
            title="Como o nível de serviço é medido por operador"
            items={[
              {
                term: "Tempo médio / P90",
                definition:
                  "Só existem para operadores que puxam paletes com armazenagem posterior. Cada palete é pareado (FIFO por lote) e o tempo é a diferença entre puxada e armazenagem. Quem só puxa no dia não tem par completo, então fica '—'.",
              },
              {
                term: "% SLA do operador",
                definition:
                  "Percentual dos paletes puxados pelo operador que foram armazenados dentro do tempo alvo (30 min). Se ele só puxa e outro armazena, o SLA é atribuído ao operador que puxou, medindo o fluxo do palete.",
              },
              {
                term: "Por que alguns aparecem '—'",
                definition:
                  "Sem pares puxada→armazenagem completos no período, não há como calcular tempo médio, P90 ou SLA — isso é normal para quem só fez puxadas ou só armazenagens no período.",
              },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operador</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Puxadas</TableHead>
                <TableHead>Qtd puxada</TableHead>
                <TableHead>Armazenagens</TableHead>
                <TableHead>Qtd armazenada</TableHead>
                <TableHead>Tempo médio</TableHead>
                <TableHead>P90</TableHead>
                <TableHead>% SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <OpRow key={String(o.operatorId)} o={o} />
              ))}
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Sem dados no período.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "default",
  sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "neutral";
  sub?: string;
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
    <Card className="p-4">
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
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneCls[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
