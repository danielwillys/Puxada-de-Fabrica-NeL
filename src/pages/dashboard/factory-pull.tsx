import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Factory,
  Inbox,
  Package,
  Scale,
  Timer,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FilterBar } from "@/components/filter-bar";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useImports, useMetrics, useReconciliation, type GlobalFilters } from "@/lib/queries";
import { useFilters } from "@/context/filters-context";
import { fmtInt, fmtPercent, fmtQty } from "@/lib/format";
import { ORDER_STATUS_META, type ProductionOrderMetric } from "@/lib/types";

const C = {
  primary: "#2563eb",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#dc2626",
  muted: "#94a3b8",
};

interface DayPoint {
  day: string;
  planned: number;
  produced: number;
  pulled: number;
  balance: number;
  efficiency: number;
}

function buildDayPoints(rows: ProductionOrderMetric[]): DayPoint[] {
  const map = new Map<string, DayPoint>();
  for (const r of rows) {
    const day = (r.created_date ?? "").slice(0, 10) || "sem data";
    const p = map.get(day) ?? {
      day,
      planned: 0,
      produced: 0,
      pulled: 0,
      balance: 0,
      efficiency: 0,
    };
    p.planned += r.planned_quantity;
    p.produced += r.confirmed_quantity;
    p.pulled += r.pulled_quantity;
    p.balance += r.balance_quantity;
    map.set(day, p);
  }
  return [...map.values()]
    .map((p) => ({
      ...p,
      efficiency:
        p.planned > 0 ? Math.min(100, Math.round((p.pulled / p.planned) * 100)) : 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function ChartCard({
  title,
  sub,
  children,
  className,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <p className="text-sm font-semibold">{title}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      <div className="mt-3 h-64">{children}</div>
    </Card>
  );
}

function RankList({
  title,
  icon,
  rows,
  render,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { key: string; label: string; value: number; unit?: string }[];
  render: (r: { key: string; label: string; value: number; unit?: string }) => React.ReactNode;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => render(r))}
        </div>
      )}
    </Card>
  );
}

const CHART_TOOLTIP = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

export function FactoryPullDashboard() {
  const navigate = useNavigate();
  const { filters, debounced, setFilters } = useFilters();
  const metrics = useMetrics(debounced);
  const reconciliation = useReconciliation(debounced);
  const imports = useImports();

  const rows = useMemo(() => metrics.data ?? [], [metrics.data]);
  const hasAnyImport = (imports.data?.length ?? 0) > 0;

  const totals = useMemo(() => {
    const t = {
      orders: 0,
      notStarted: 0,
      inProgress: 0,
      completed: 0,
      excessCount: 0,
      planned: 0,
      produced: 0,
      pulled: 0,
      balance: 0,
      excessQty: 0,
      required: 0,
    };
    for (const r of rows) {
      t.orders += 1;
      if (r.status === "not_started") t.notStarted += 1;
      if (r.status === "in_progress") t.inProgress += 1;
      if (r.status === "completed") t.completed += 1;
      if (r.status === "excess") t.excessCount += 1;
      t.planned += r.planned_quantity;
      t.produced += r.confirmed_quantity;
      t.pulled += r.pulled_quantity;
      t.balance += r.balance_quantity;
      t.excessQty += r.excess_quantity;
      t.required += r.required_quantity;
    }
    return t;
  }, [rows]);

  const efficiency = totals.required > 0 ? Math.min(100, (totals.pulled / totals.required) * 100) : 0;

  const reconciliationStats = useMemo(() => {
    const rowsR = reconciliation.data ?? [];
    let ok = 0;
    let positive = 0;
    let negative = 0;
    for (const r of rowsR) {
      if (r.classification === "ok") ok += 1;
      else if (r.classification === "positive") positive += 1;
      else negative += 1;
    }
    return { ok, positive, negative, total: rowsR.length };
  }, [reconciliation.data]);

  const dayPoints = useMemo(() => buildDayPoints(rows), [rows]);

  const statusPie = useMemo(() => {
    const countByStatus: Record<string, number> = {
      not_started: totals.notStarted,
      in_progress: totals.inProgress,
      completed: totals.completed,
      excess: totals.excessCount,
    };
    return (["not_started", "in_progress", "completed", "excess"] as const).map(
      (s) => ({
        name: ORDER_STATUS_META[s].label,
        value: countByStatus[s],
        color:
          s === "not_started"
            ? C.muted
            : s === "in_progress"
              ? C.warning
              : s === "completed"
                ? C.success
                : C.danger,
      }),
    );
  }, [totals]);

  const excessByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.excess_quantity > 0) {
        map.set(r.material_code, (map.get(r.material_code) ?? 0) + r.excess_quantity);
      }
    }
    return [...map.entries()]
      .map(([k, v]) => ({ name: k, value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rows]);

  const topBalanceOrders = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.balance_quantity - a.balance_quantity)
        .filter((r) => r.balance_quantity > 0)
        .slice(0, 10),
    [rows],
  );

  const topBalanceMaterials = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.material_code, (map.get(r.material_code) ?? 0) + r.balance_quantity);
    return [...map.entries()]
      .map(([k, v]) => ({ key: k, label: k, value: v }))
      .sort((a, b) => b.value - a.value)
      .filter((r) => r.value > 0)
      .slice(0, 10);
  }, [rows]);

  const topExcessOrders = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.excess_quantity - a.excess_quantity)
        .filter((r) => r.excess_quantity > 0)
        .slice(0, 10),
    [rows],
  );

  const topExcessMaterials = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.material_code, (map.get(r.material_code) ?? 0) + r.excess_quantity);
    return [...map.entries()]
      .map(([k, v]) => ({ key: k, label: k, value: v }))
      .sort((a, b) => b.value - a.value)
      .filter((r) => r.value > 0)
      .slice(0, 10);
  }, [rows]);

  const openStatus = (status: string) => {
    // Keep the filter applied on the orders screen (shared, persistent filters).
    setFilters({ ...filters, status: status as GlobalFilters["status"] });
    navigate("/ordens");
  };

  const loading = metrics.isLoading;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard de Puxada</h1>
        <p className="text-sm text-muted-foreground">
          Fábrica → Puxada → Recebimento → Armazenagem
        </p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium">
            Nenhum dado disponível para o período selecionado.
          </p>
          {!hasAnyImport ? (
            <>
              <p className="text-sm text-muted-foreground">
                Importe os arquivos COOISPI, Recebimento e MON para começar a análise.
              </p>
              <Link to="/importacao">
                <Badge variant="info" className="gap-1 px-3 py-1.5">
                  Ir para Importação <ArrowRight className="h-3.5 w-3.5" />
                </Badge>
              </Link>
            </>
          ) : null}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <KpiCard label="Ordens" value={fmtInt(totals.orders)} icon={Boxes} />
            <KpiCard
              label="Não iniciadas"
              value={fmtInt(totals.notStarted)}
              icon={CircleDashed}
              tone="neutral"
              onClick={() => openStatus("not_started")}
            />
            <KpiCard
              label="Em andamento"
              value={fmtInt(totals.inProgress)}
              icon={Factory}
              tone="warning"
              onClick={() => openStatus("in_progress")}
            />
            <KpiCard
              label="Finalizadas"
              value={fmtInt(totals.completed)}
              icon={CheckCircle2}
              tone="success"
              onClick={() => openStatus("completed")}
            />
            <KpiCard
              label="Com excesso"
              value={fmtInt(totals.excessCount)}
              icon={AlertTriangle}
              tone="danger"
              onClick={() => openStatus("excess")}
            />
            <KpiCard
              label="Eficiência de puxada"
              value={fmtPercent(efficiency)}
              icon={TrendingUp}
              sub="Puxado físico ÷ exigido"
            />
            <KpiCard label="Qtd. planejada" value={fmtQty(totals.planned)} icon={Package} />
            <KpiCard label="Qtd. produzida" value={fmtQty(totals.produced)} icon={Factory} />
            <KpiCard label="Qtd. puxada" value={fmtQty(totals.pulled)} icon={Boxes} tone="info" />
            <KpiCard label="Saldo a puxar" value={fmtQty(totals.balance)} icon={Timer} tone="warning" />
            <KpiCard label="Excesso" value={fmtQty(totals.excessQty)} icon={AlertTriangle} tone="danger" />
            <KpiCard
              label="Divergência SAP × físico"
              value={`${reconciliationStats.positive + reconciliationStats.negative}`}
              icon={Scale}
              tone={reconciliationStats.positive + reconciliationStats.negative > 0 ? "warning" : "success"}
              sub={reconciliationStats.total > 0 ? `de ${reconciliationStats.total} ordens` : "sem dados"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Planejado × Produzido × Puxado" sub="Por dia de criação da ordem">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="planned" name="Planejado" fill={C.muted} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="produced" name="Produzido" fill={C.primary} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="pulled" name="Puxado" fill={C.success} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Eficiência ao longo do tempo" sub="Eficiência diária (%). Máx. 100%">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Line type="monotone" dataKey="efficiency" name="Eficiência %" stroke={C.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Ordens por status">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {statusPie.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Saldo a puxar por dia" sub="Saldo acumulado das ordens do período">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="balance" name="Saldo" fill={C.warning} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Excesso por material" sub="Top 10 materiais com maior excesso">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={excessByMaterial} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={100} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="value" name="Excesso" fill={C.danger} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Puxado físico por dia" sub="Soma das entradas físicas válidas (Recebimento)">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dayPoints.map((p) => ({ day: p.day, pulled: p.pulled }))}
                >
                  <defs>
                    <linearGradient id="gradPulled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.success} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Area type="monotone" dataKey="pulled" name="Puxado" stroke={C.success} fill="url(#gradPulled)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RankList
              title="Top ordens com maior saldo"
              icon={<Timer className="h-4 w-4" />}
              rows={topBalanceOrders.map((r) => ({ key: r.order_number, label: r.order_number, value: r.balance_quantity }))}
              render={(r) => (
                <Link
                  key={r.key}
                  to={`/ordens/${encodeURIComponent(r.key)}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <span className="truncate font-medium">{r.label}</span>
                  <span className="ml-2 font-semibold tabular-nums text-warning">{fmtQty(r.value)}</span>
                </Link>
              )}
            />
            <RankList
              title="Top materiais com maior saldo"
              icon={<Package className="h-4 w-4" />}
              rows={topBalanceMaterials}
              render={(r) => (
                <div key={r.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate font-medium">{r.label}</span>
                  <span className="ml-2 font-semibold tabular-nums text-warning">{fmtQty(r.value)}</span>
                </div>
              )}
            />
            <RankList
              title="Top ordens com maior excesso"
              icon={<AlertTriangle className="h-4 w-4" />}
              rows={topExcessOrders.map((r) => ({ key: r.order_number, label: r.order_number, value: r.excess_quantity }))}
              render={(r) => (
                <Link
                  key={r.key}
                  to={`/ordens/${encodeURIComponent(r.key)}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <span className="truncate font-medium">{r.label}</span>
                  <span className="ml-2 font-semibold tabular-nums text-danger">{fmtQty(r.value)}</span>
                </Link>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold">Ordens por status</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.muted }} />
                    Não iniciadas
                  </span>
                  <span className="font-medium tabular-nums">{fmtInt(totals.notStarted)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.warning }} />
                    Em andamento
                  </span>
                  <span className="font-medium tabular-nums">{fmtInt(totals.inProgress)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.success }} />
                    Finalizadas
                  </span>
                  <span className="font-medium tabular-nums">{fmtInt(totals.completed)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.danger }} />
                    Excesso
                  </span>
                  <span className="font-medium tabular-nums">{fmtInt(totals.excessCount)}</span>
                </div>
              </div>
            </Card>
            <RankList
              title="Top materiais com maior excesso"
              icon={<AlertTriangle className="h-4 w-4" />}
              rows={topExcessMaterials}
              render={(r) => (
                <div key={r.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate font-medium">{r.label}</span>
                  <span className="ml-2 font-semibold tabular-nums text-danger">{fmtQty(r.value)}</span>
                </div>
              )}
            />
            <Card className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold">Divergência SAP × físico</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">OK</span>
                  <span className="font-medium tabular-nums text-success">{fmtInt(reconciliationStats.ok)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Divergência positiva (físico &gt; SAP)</span>
                  <span className="font-medium tabular-nums text-warning">{fmtInt(reconciliationStats.positive)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Divergência negativa (físico &lt; SAP)</span>
                  <span className="font-medium tabular-nums text-danger">{fmtInt(reconciliationStats.negative)}</span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
