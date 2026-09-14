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
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FilterBar } from "@/components/filter-bar";
import { InfoPopover } from "@/components/info-popover";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDailyPulled,
  useImports,
  useMetrics,
  useReconciliation,
  useSettings,
  periodToRange,
  type GlobalFilters,
} from "@/lib/queries";
import { useFilters } from "@/context/filters-context";
import { fmtInt, fmtQty } from "@/lib/format";
import { type ProductionOrderMetric } from "@/lib/types";
import { C, CHART_TOOLTIP, ChartCard } from "./shared";

interface DayPoint {
  day: string;
  planned: number;
  produced: number;
  pulled: number;
  pending: number;
  balance: number;
  efficiency: number;
}

function dayRef(value: string | null, fallback: string | null): string {
  return (value ?? fallback ?? "").slice(0, 10) || "sem data";
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function buildDayPoints(
  rows: ProductionOrderMetric[],
  range: { start: string; end: string },
): DayPoint[] {
  const map = new Map<string, DayPoint>();
  const add = (day: string, patch: Partial<DayPoint>) => {
    const cur = map.get(day) ?? {
      day,
      planned: 0,
      produced: 0,
      pulled: 0,
      pending: 0,
      balance: 0,
      efficiency: 0,
    };
    map.set(day, { ...cur, ...patch });
  };

  for (const r of rows) {
    const plannedDay = dayRef(r.planned_start, r.created_date);
    add(plannedDay, {
      planned: (map.get(plannedDay)?.planned ?? 0) + r.planned_quantity,
    });
    const prodDay = dayRef(r.actual_start, r.created_date);
    add(prodDay, {
      produced: (map.get(prodDay)?.produced ?? 0) + r.confirmed_quantity,
      pulled: (map.get(prodDay)?.pulled ?? 0) + r.pulled_quantity,
      pending: (map.get(prodDay)?.pending ?? 0) + Math.max(0, r.confirmed_quantity - r.pulled_quantity),
      balance: (map.get(prodDay)?.balance ?? 0) + Math.max(0, r.confirmed_quantity - r.pulled_quantity),
    });
  }

  const today = todayStr();
  const inRange =
    range.start && range.end
      ? (d: string) => d === "sem data" || (d >= range.start && d <= range.end)
      : () => true;

  return [...map.values()]
    .map((p) => ({
      ...p,
      efficiency:
        p.produced > 0 ? Math.min(100, Math.round((p.pulled / p.produced) * 100)) : 0,
    }))
    .filter((p) => p.day <= today && inRange(p.day))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Rótulo compacto para valores sobre as barras (evita poluir o gráfico). */
function valueLabel(n: number): string {
  const v = Math.round(n);
  return v >= 10000
    ? `${Math.round(v / 1000)} mil`
    : v.toLocaleString("pt-BR");
}

function RankList({
  title,
  icon,
  rows,
  render,
  help,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { key: string; label: string; value: number }[];
  render: (r: { key: string; label: string; value: number }) => React.ReactNode;
  help?: { title: string; items: { term: string; definition: string }[] };
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
        {help ? <InfoPopover title={help.title} items={help.items} className="ml-auto" /> : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="flex flex-col gap-1.5">{rows.map((r) => render(r))}</div>
      )}
    </Card>
  );
}

export function ManagerialDashboard() {
  const navigate = useNavigate();
  const { filters, debounced, setFilters } = useFilters();
  const metrics = useMetrics(debounced);
  const reconciliation = useReconciliation(debounced);
  const imports = useImports();
  const dailyPulled = useDailyPulled(debounced);
  const settings = useSettings();

  const rows = useMemo(() => metrics.data ?? [], [metrics.data]);
  const hasAnyImport = (imports.data?.length ?? 0) > 0;

  /** Meta diária de puxada configurável (Configurações → dashboard). */
  const goal = useMemo(() => {
    const row = (settings.data ?? []).find((s) => s.key === "pull_daily_goal");
    const v = row?.value;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [settings.data]);

  const range =
    debounced.period !== "custom"
      ? periodToRange(debounced.period)
      : { start: debounced.startDate, end: debounced.endDate };

  const dayPoints = useMemo(() => buildDayPoints(rows, range), [rows, range]);

  const pulledByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dailyPulled.data ?? []) {
      const day = r.goods_receipt_date ?? "sem data";
      map.set(day, (map.get(day) ?? 0) + r.quantity);
    }
    return [...map.entries()]
      .map(([day, pulled]) => ({ day, pulled }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [dailyPulled.data]);

  const totals = useMemo(() => {
    const t = {
      orders: 0,
      notStarted: 0,
      inProgress: 0,
      completed: 0,
      excessCount: 0,
      openTasks: 0,
      ordersWithOpenTasks: 0,
    };
    for (const r of rows) {
      t.orders += 1;
      if (r.status === "not_started") t.notStarted += 1;
      if (r.status === "in_progress") t.inProgress += 1;
      if (r.status === "completed") t.completed += 1;
      if (r.status === "excess") t.excessCount += 1;
      if ((r.open_task_count ?? 0) > 0) {
        t.openTasks += r.open_task_count ?? 0;
        t.ordersWithOpenTasks += 1;
      }
    }
    return t;
  }, [rows]);

  const reconciliationStats = useMemo(() => {
    const rowsR = reconciliation.data ?? [];
    let positive = 0;
    let negative = 0;
    for (const r of rowsR) {
      if (r.classification === "positive") positive += 1;
      else if (r.classification === "negative") negative += 1;
    }
    return { positive, negative };
  }, [reconciliation.data]);

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

  const yMaxPulled = useMemo(() => {
    const max = Math.max(1, ...pulledByDay.map((p) => p.pulled), goal ?? 0);
    return Math.ceil(max * 1.2);
  }, [pulledByDay, goal]);

  const openStatus = (status: string) => {
    setFilters({ ...filters, status: status as GlobalFilters["status"] });
    navigate("/ordens");
  };

  const openOpenTasks = () => {
    setFilters({ ...filters, openTasksOnly: true });
    navigate("/ordens");
  };

  const openDivergence = (kind: "positive" | "negative") => {
    setFilters({ ...filters, divergence: kind });
    navigate("/ordens");
  };

  const loading = metrics.isLoading;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard Gerencial</h1>
        <p className="text-sm text-muted-foreground">
          Visão de decisão: ordens, eficiência, excessos e divergências SAP × físico
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
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
              label="Tarefas de puxada em aberto"
              value={fmtInt(totals.openTasks)}
              icon={Timer}
              tone="warning"
              sub={`${fmtInt(totals.ordersWithOpenTasks)} ordens aguardando`}
              onClick={openOpenTasks}
            />
            <KpiCard
              label="Físico > SAP"
              value={fmtInt(reconciliationStats.positive)}
              icon={Scale}
              tone="warning"
              sub="Puxado a mais que o fornecimento"
              onClick={() => openDivergence("positive")}
            />
            <KpiCard
              label="Físico < SAP"
              value={fmtInt(reconciliationStats.negative)}
              icon={Scale}
              tone="danger"
              sub="Faltou puxar do fornecimento"
              onClick={() => openDivergence("negative")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard
              title="Planejado × Apontado × Puxado × Pendente"
              sub="Planejado (Data-base iníc.) · Apontado/produzido (início real) · Puxado (Recebimento) · Pendente"
              exportName={`planejado_apontado_puxado_${debounced.period}.png`}
              exportLegend={[
                { name: "Planejado", color: C.muted },
                { name: "Apontado (produzido)", color: C.primary },
                { name: "Puxado (Recebimento)", color: C.success },
                { name: "Pendente puxada", color: C.danger },
              ]}
              help={{
                title: "Como ler este gráfico",
                items: [
                  {
                    term: "Planejado",
                    definition:
                      "Quantidade planejada da ordem, agrupada pela data-base de início prevista.",
                  },
                  {
                    term: "Apontado (produzido)",
                    definition:
                      "Quantidade boa confirmada da produção, agrupada pela data real de início.",
                  },
                  {
                    term: "Puxado (Recebimento)",
                    definition:
                      "Quantidade de caixas recebidas no depósito, por data do recebimento.",
                  },
                  {
                    term: "Pendente puxada",
                    definition:
                      "O que foi produzido mas ainda não puxado: produzido − puxado.",
                  },
                ],
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="planned" name="Planejado" fill={C.muted} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="produced" name="Apontado" fill={C.primary} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="pulled" name="Puxado" fill={C.success} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="pending" name="Pendente" fill={C.danger} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Eficiência ao longo do tempo"
              sub="Puxado (Recebimento) ÷ produzido (GMEIN) por dia. Máx. 100%"
              exportName={`eficiencia_${debounced.period}.png`}
              exportLegend={[{ name: "Eficiência %", color: C.primary }]}
              help={{
                title: "Eficiência",
                items: [
                  {
                    term: "Fórmula",
                    definition:
                      "Eficiência = puxado ÷ produzido, limitada a 100%. Usa o produzido real, não o planejado.",
                  },
                  {
                    term: "Por que produzido?",
                    definition:
                      "Se planejou x e produziu y, o real da operação é y. A eficiência mede quanto do que foi realmente produzido já foi puxado.",
                  },
                ],
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Line
                    type="monotone"
                    dataKey="efficiency"
                    name="Eficiência %"
                    stroke={C.primary}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Excesso por material"
              sub="Top 10 materiais com maior excesso"
              exportName={`excesso_por_material_${debounced.period}.png`}
              exportLegend={[{ name: "Excesso", color: C.danger }]}
              help={{
                title: "Excesso por material",
                items: [
                  {
                    term: "Definição",
                    definition:
                      "Quantidade puxada que ultrapassou o necessário da ordem (puxado − exigido). Indica material recebido a mais que o previsto.",
                  },
                  {
                    term: "Onde agir",
                    definition:
                      "Materiais no topo concentram o maior volume de excesso e são os candidatos naturais a estorno/revisão.",
                  },
                ],
              }}
            >
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

            <ChartCard
              title="Puxado físico por dia"
              sub={
                goal
                  ? `Valores sobre as barras · linha tracejada = meta diária de ${fmtQty(goal)} (Configurações)`
                  : "Valores sobre as barras · defina a meta diária em Configurações"
              }
              exportName={`puxado_fisico_por_dia_${debounced.period}.png`}
              exportLegend={[
                { name: "Puxado", color: C.success },
                ...(goal ? [{ name: `Meta diária (${fmtQty(goal)})`, color: C.warning }] : []),
              ]}
              help={{
                title: "Puxado físico",
                items: [
                  {
                    term: "Fonte dos dados",
                    definition:
                      "Soma das caixas recebidas no depósito, por data do recebimento, considerando apenas as entradas válidas.",
                  },
                  {
                    term: "Estornos",
                    definition:
                      "Entradas estornadas não aparecem neste gráfico — o valor reflete apenas o que permanece válido.",
                  },
                  {
                    term: "Meta diária",
                    definition:
                      "Linha tracejada amarela: meta de caixas por dia configurada pelo administrador em Configurações.",
                  },
                ],
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pulledByDay}>
                  <defs>
                    <linearGradient id="gradPulled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.success} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, yMaxPulled]} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {goal ? (
                    <ReferenceLine
                      y={goal}
                      stroke={C.warning}
                      strokeDasharray="5 4"
                      label={{
                        value: `Meta ${valueLabel(goal)}`,
                        position: "insideTopRight",
                        fontSize: 11,
                        fill: C.warning,
                      }}
                    />
                  ) : null}
                  <Area
                    type="monotone"
                    dataKey="pulled"
                    name="Puxado"
                    stroke={C.success}
                    fill="url(#gradPulled)"
                    strokeWidth={2}
                  >
                    <LabelList
                      dataKey="pulled"
                      position="top"
                      fontSize={10}
                      fill="hsl(var(--muted-foreground))"
                      formatter={(v) => valueLabel(Number(v))}
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RankList
              title="Top ordens com maior saldo"
              icon={<Timer className="h-4 w-4" />}
              rows={topBalanceOrders.map((r) => ({ key: r.order_number, label: r.order_number, value: r.balance_quantity }))}
              help={{
                title: "Top ordens com maior saldo",
                items: [
                  {
                    term: "Definição",
                    definition:
                      "Ordens com maior quantidade produzida ainda não puxada (produzido − puxado). Priorize estas para reduzir o backlog.",
                  },
                ],
              }}
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
              help={{
                title: "Top materiais com maior saldo",
                items: [
                  {
                    term: "Definição",
                    definition:
                      "Materiais com maior volume produzido e ainda não puxado, somando todas as ordens do período.",
                  },
                ],
              }}
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
              help={{
                title: "Top ordens com maior excesso",
                items: [
                  {
                    term: "Definição",
                    definition:
                      "Ordens com maior quantidade puxada acima do exigido. Úteis para identificar onde houve recebimento a mais.",
                  },
                ],
              }}
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
        </>
      )}
    </div>
  );
}
