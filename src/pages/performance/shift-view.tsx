import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CircleDashed,
  Gauge,
  Package,
  Timer,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePerformanceTasks,
  useSettings,
  useShifts,
  type GlobalFilters,
} from "@/lib/queries";
import {
  buildBacklogByShift,
  buildShiftSummaries,
  type ShiftSummary,
} from "@/lib/performance";
import { fmtDurationMinutes, fmtInt, fmtPercent, fmtQty } from "@/lib/format";

const C = {
  primary: "#2563eb",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#dc2626",
  muted: "#94a3b8",
};

const CHART_TOOLTIP = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

function shiftColor(i: number) {
  const palette = [C.primary, C.success, C.warning, "#8b5cf6", C.danger, C.muted];
  return palette[i % palette.length];
}

function ShiftCard({ s, index }: { s: ShiftSummary; index: number }) {
  const color = shiftColor(index);
  const sla = s.slaPct ?? null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: color }}
          />
          <div>
            <p className="text-sm font-semibold">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.code}</p>
          </div>
        </div>
        {s.pulls + s.stores === 0 ? <Badge variant="neutral">Sem dados</Badge> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border p-2">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ArrowUpFromLine className="h-3 w-3" /> Puxados
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtInt(s.pulls)}</p>
          <p className="text-[11px] text-muted-foreground">{fmtQty(s.pullQty)} qtd</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ArrowDownToLine className="h-3 w-3" /> Armazenados
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtInt(s.stores)}</p>
          <p className="text-[11px] text-muted-foreground">{fmtQty(s.storeQty)} qtd</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Tempo médio
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {fmtDurationMinutes(s.avgMinutes)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">P90</p>
          <p className="text-sm font-semibold tabular-nums">
            {fmtDurationMinutes(s.p90Minutes)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            % SLA ({s.slaMinutes} min)
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              sla !== null && sla >= 90
                ? "text-success"
                : sla !== null && sla >= 60
                  ? "text-warning"
                  : sla !== null
                    ? "text-danger"
                    : ""
            }`}
          >
            {sla === null ? "—" : fmtPercent(sla)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Abertas", s.openTasks, "text-foreground"],
            ["Em espera", s.waitingTasks, "text-warning"],
            ["Estornadas", s.reversedTasks, "text-danger"],
          ] as const
        ).map(([label, value, cls]) => (
          <div key={label}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className={`text-sm font-semibold tabular-nums ${cls}`}>
              {fmtInt(value)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ShiftCardRow({ summaries }: { summaries: ShiftSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {summaries.map((s, i) => (
        <ShiftCard key={String(s.shiftId ?? "null")} s={s} index={i} />
      ))}
    </div>
  );
}

function ChartCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">{title}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      <div className="mt-3 h-64">{children}</div>
    </Card>
  );
}

interface FlowPoint {
  day: string;
  entradas: number;
  processadas: number;
  saldo: number;
}

export function ShiftPerformanceView({ filters }: { filters: GlobalFilters }) {
  const tasks = usePerformanceTasks(filters);
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

  const summaries = useMemo(
    () => buildShiftSummaries(tasks.data ?? [], shiftInputs, slaMinutes),
    [tasks.data, shiftInputs, slaMinutes],
  );

  const backlogs = useMemo(
    () => buildBacklogByShift(tasks.data ?? [], shiftInputs),
    [tasks.data, shiftInputs],
  );

  const byDay = useMemo<Record<string, string | number>[]>(() => {
    const map = new Map<string, Record<string, string | number>>();
    for (const s of summaries) {
      for (const d of s.daily) {
        const row = map.get(d.day) ?? { day: d.day };
        row[`${s.code}.pulls`] = d.pulls;
        row[`${s.code}.stores`] = d.stores;
        row[`${s.code}.pullQty`] = d.pullQty;
        row[`${s.code}.storeQty`] = d.storeQty;
        map.set(d.day, row);
      }
    }
    return [...map.values()].sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
  }, [summaries]);

  const backlogByDay = useMemo<Record<string, string | number>[]>(() => {
    const map = new Map<string, Record<string, string | number>>();
    for (const b of backlogs) {
      for (const p of b.points) {
        const row = map.get(p.day) ?? { day: p.day };
        row[`${b.code}.saldo`] = p.saldo;
        row[`${b.code}.entradas`] = p.entradas;
        row[`${b.code}.processadas`] = p.processadas;
        map.set(p.day, row);
      }
    }
    return [...map.values()].sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
  }, [backlogs]);

  const flow = useMemo<FlowPoint[]>(() => {
    if (backlogs.length === 0) return [];
    // aggregate across shifts into one flow view
    const map = new Map<string, FlowPoint>();
    for (const b of backlogs) {
      for (const p of b.points) {
        const cur = map.get(p.day) ?? { day: p.day, entradas: 0, processadas: 0, saldo: 0 };
        cur.entradas += p.entradas;
        cur.processadas += p.processadas;
        cur.saldo += p.saldo;
        map.set(p.day, cur);
      }
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [backlogs]);

  if (tasks.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const totals = summaries.reduce(
    (acc, s) => {
      acc.pulls += s.pulls;
      acc.stores += s.stores;
      acc.pullQty += s.pullQty;
      acc.storeQty += s.storeQty;
      acc.open += s.openTasks;
      acc.waiting += s.waitingTasks;
      acc.reversed += s.reversedTasks;
      return acc;
    },
    { pulls: 0, stores: 0, pullQty: 0, storeQty: 0, open: 0, waiting: 0, reversed: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Paletes puxados" value={fmtInt(totals.pulls)} icon={ArrowUpFromLine} tone="info" />
        <Kpi label="Paletes armazenados" value={fmtInt(totals.stores)} icon={ArrowDownToLine} tone="success" />
        <Kpi label="Qtd puxada" value={fmtQty(totals.pullQty)} icon={Package} />
        <Kpi label="Qtd armazenada" value={fmtQty(totals.storeQty)} icon={Boxes} />
        <Kpi label="Tarefas abertas" value={fmtInt(totals.open)} icon={CircleDashed} tone="neutral" />
        <Kpi label="Em espera" value={fmtInt(totals.waiting)} icon={Timer} tone="warning" />
        <Kpi label="Estornadas" value={fmtInt(totals.reversed)} icon={AlertTriangle} tone="danger" />
        <Kpi
          label="SLA alvo"
          value={`${slaMinutes} min`}
          icon={Gauge}
          sub="Puxada → armazenagem"
        />
      </div>

      <ShiftCardRow summaries={summaries} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Paletes puxados por turno" sub="Por dia operacional">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              {summaries.map((s, i) => (
                <Bar
                  key={s.code}
                  dataKey={`${s.code}.pulls`}
                  name={s.code}
                  fill={shiftColor(i)}
                  radius={[3, 3, 0, 0]}
                  stackId="pulls"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Paletes armazenados por turno" sub="Por dia operacional">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              {summaries.map((s, i) => (
                <Bar
                  key={s.code}
                  dataKey={`${s.code}.stores`}
                  name={s.code}
                  fill={shiftColor(i)}
                  radius={[3, 3, 0, 0]}
                  stackId="stores"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Qtd movimentada (puxada + armazenagem)" sub="Por dia operacional">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              {summaries.map((s, i) => (
                <Bar
                  key={s.code}
                  dataKey={`${s.code}.pullQty`}
                  name={`${s.code} puxada`}
                  fill={shiftColor(i)}
                  radius={[3, 3, 0, 0]}
                />
              ))}
              {summaries.map((s, i) => (
                <Bar
                  key={s.code}
                  dataKey={`${s.code}.storeQty`}
                  name={`${s.code} armazenada`}
                  fill={shiftColor(i)}
                  radius={[3, 3, 0, 0]}
                  opacity={0.5}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Backlog por turno (saldo em aberto)" sub="Puxadas sem armazenagem confirmada">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={backlogByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              {backlogs.map((b, i) => (
                <Line
                  key={b.code}
                  type="monotone"
                  dataKey={`${b.code}.saldo`}
                  name={`${b.code} saldo`}
                  stroke={shiftColor(i)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Backlog: inicial × entradas × processadas × final"
          sub="Fluxo diário agregado de puxadas (entradas) e armazenagens (processadas)"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              <Bar dataKey="entradas" name="Entradas (puxadas)" fill={C.primary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="processadas" name="Processadas (armazenagens)" fill={C.success} radius={[3, 3, 0, 0]} />
              <Bar dataKey="saldo" name="Saldo final" fill={C.warning} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold">Comparativo de turnos</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Turno</TableHead>
                <TableHead>Puxadas</TableHead>
                <TableHead>Qtd puxada</TableHead>
                <TableHead>Armazenagens</TableHead>
                <TableHead>Qtd armazenada</TableHead>
                <TableHead>Tempo médio</TableHead>
                <TableHead>P90</TableHead>
                <TableHead>% SLA</TableHead>
                <TableHead>Abertas</TableHead>
                <TableHead>Espera</TableHead>
                <TableHead>Estornadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => (
                <TableRow key={String(s.shiftId ?? "null")}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="tabular-nums">{fmtInt(s.pulls)}</TableCell>
                  <TableCell className="tabular-nums">{fmtQty(s.pullQty)}</TableCell>
                  <TableCell className="tabular-nums">{fmtInt(s.stores)}</TableCell>
                  <TableCell className="tabular-nums">{fmtQty(s.storeQty)}</TableCell>
                  <TableCell className="tabular-nums">{fmtDurationMinutes(s.avgMinutes)}</TableCell>
                  <TableCell className="tabular-nums">{fmtDurationMinutes(s.p90Minutes)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.slaPct === null
                          ? "neutral"
                          : s.slaPct >= 90
                            ? "success"
                            : s.slaPct >= 60
                              ? "warning"
                              : "danger"
                      }
                    >
                      {s.slaPct === null ? "—" : fmtPercent(s.slaPct)}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{fmtInt(s.openTasks)}</TableCell>
                  <TableCell className="tabular-nums">{fmtInt(s.waitingTasks)}</TableCell>
                  <TableCell className="tabular-nums">{fmtInt(s.reversedTasks)}</TableCell>
                </TableRow>
              ))}
              {summaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
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
