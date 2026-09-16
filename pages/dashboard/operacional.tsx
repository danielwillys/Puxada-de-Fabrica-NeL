import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes,
  CircleDashed,
  Download,
  FileText,
  Loader2,
  Package,
  RotateCcw,
  Scale,
  Sheet as SheetIcon,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FilterBar } from "@/components/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { exportCsv, exportExcel } from "@/lib/excel";
import { fmtDateTime, fmtDurationMinutes, fmtInt, fmtPercent, fmtQty } from "@/lib/format";
import {
  useMetrics,
  usePerformanceTasks,
  useReconciliation,
  useReversedReceipts,
  useSettings,
  useShifts,
} from "@/lib/queries";
import {
  buildShiftSummaries,
  type ShiftSummary,
} from "@/lib/performance";
import { downloadDashboardPng } from "@/lib/png-export";
import { sortRows, type SortState } from "@/lib/sort";
import { SortableTh } from "@/components/sortable-th";
import { useFilters } from "@/context/filters-context";
import { C, CHART_TOOLTIP, ChartCard, Kpi } from "./shared";

interface DailyPoint {
  day: string;
  pulls: number;
  stores: number;
  pullQty: number;
  storeQty: number;
}

export function OperationalDashboard() {
  const navigate = useNavigate();
  const { filters, debounced, setFilters } = useFilters();
  const tasks = usePerformanceTasks(debounced);
  const metrics = useMetrics(debounced);
  const reconciliation = useReconciliation(debounced);
  const shifts = useShifts();
  const settings = useSettings();
  const reversed = useReversedReceipts(debounced);

  const rootRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

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

  const totals = useMemo(
    () =>
      summaries.reduce(
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
      ),
    [summaries],
  );

  /** Tarefas de puxada (1020) em aberto, somadas das ordens do período. */
  const openTasks = useMemo(() => {
    let tasksCount = 0;
    let ordersWithOpen = 0;
    for (const r of metrics.data ?? []) {
      if ((r.open_task_count ?? 0) > 0) {
        tasksCount += r.open_task_count ?? 0;
        ordersWithOpen += 1;
      }
    }
    return { tasksCount, ordersWithOpen };
  }, [metrics.data]);

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

  /** Ordens com divergência SAP × físico (ignora as normalizadas). */
  const divergentOrders = useMemo(
    () =>
      (metrics.data ?? [])
        .filter((r) => !r.normalized_saldo)
        .map((r) => ({
          order_number: r.order_number,
          material_code: r.material_code,
          status: r.status,
          divergence: r.pulled_quantity - r.sap_supplied_quantity,
        }))
        .filter((o) => Math.abs(o.divergence) > 0.001)
        .sort((a, b) => Math.abs(b.divergence) - Math.abs(a.divergence)),
    [metrics.data],
  );

  const openDivergenceAll = () => {
    setFilters({ ...filters, status: "divergence", divergenceType: "all" });
    navigate("/ordens");
  };

  const daily = useMemo<DailyPoint[]>(() => {
    const map = new Map<string, DailyPoint>();
    const add = (day: string, patch: Partial<DailyPoint>) => {
      const cur = map.get(day) ?? { day, pulls: 0, stores: 0, pullQty: 0, storeQty: 0 };
      map.set(day, { ...cur, ...patch });
    };
    for (const t of tasks.data ?? []) {
      if (t.process_type === "1020" && t.task_status !== "A") {
        const day = t.operational_pull_day ?? "sem dia";
        add(day, {
          pulls: (map.get(day)?.pulls ?? 0) + 1,
          pullQty: (map.get(day)?.pullQty ?? 0) + t.quantity,
        });
      } else if (t.process_type === "1012" && t.task_status !== "A") {
        const day = t.operational_storage_day ?? "sem dia";
        add(day, {
          stores: (map.get(day)?.stores ?? 0) + 1,
          storeQty: (map.get(day)?.storeQty ?? 0) + t.quantity,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [tasks.data]);

  const backlog = useMemo<{ day: string; entradas: number; processadas: number; saldo: number }[]>(() => {
    const entradas = new Map<string, number>();
    const processadas = new Map<string, number>();
    for (const t of tasks.data ?? []) {
      if (t.process_type === "1020") {
        const d = t.operational_pull_day;
        if (d) entradas.set(d, (entradas.get(d) ?? 0) + 1);
      } else if (t.process_type === "1012") {
        const d = t.operational_storage_day;
        if (d) processadas.set(d, (processadas.get(d) ?? 0) + 1);
      }
    }
    const days = [...new Set([...entradas.keys(), ...processadas.keys()])].sort();
    let saldo = 0;
    return days.map((day) => {
      const e = entradas.get(day) ?? 0;
      const p = processadas.get(day) ?? 0;
      saldo = saldo + e - p;
      return { day, entradas: e, processadas: p, saldo };
    });
  }, [tasks.data]);

  const reversedRows = useMemo(() => reversed.data ?? [], [reversed.data]);
  const reversedStats = useMemo(
    () => ({
      count: reversedRows.length,
      qty: reversedRows.reduce((a, r) => a + r.quantity, 0),
    }),
    [reversedRows],
  );

  const [revSort, setRevSort] = useState<SortState>({ key: "document_number", dir: "asc" });
  const reversedRowsSorted = useMemo(
    () => sortRows(reversedRows as unknown as Record<string, unknown>[], revSort).slice(0, 50),
    [reversedRows, revSort],
  );
  const toggleRevSort = (key: string) => {
    setRevSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const exportReversed = (format: "excel" | "csv") => {
    const out = reversedRows.map((r) => ({
      Documento: r.document_number,
      Ordem: r.production_order ?? "",
      Material: r.material_code,
      Lote: r.lot ?? "",
      Quantidade: r.quantity,
      Unidade: r.unit ?? "",
      "Motivo do estorno": r.reversal_reason ?? "",
      "Data do estorno": fmtDateTime(r.reversed_at),
    }));
    const base = `recebimentos_estornados_${debounced.period}_${new Date().toISOString().slice(0, 10)}`;
    if (format === "excel") exportExcel(`${base}.xlsx`, out);
    else exportCsv(`${base}.csv`, out);
  };

  const openOpenTasks = () => {
    setFilters({ ...filters, openTasksOnly: true });
    navigate("/ordens");
  };

  const handleExportDashboard = async () => {
    setExporting(true);
    try {
      await downloadDashboardPng(
        rootRef.current,
        `dashboard_operacional_${debounced.period}_${new Date().toISOString().slice(0, 10)}.png`,
      );
    } catch (e) {
      console.error("export failed", e);
      toast.error("Não foi possível gerar o PNG do dashboard.");
    } finally {
      setExporting(false);
    }
  };

  const loading = tasks.isLoading || metrics.isLoading || shifts.isLoading;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard Operacional</h1>
          <p className="text-sm text-muted-foreground">
            Visão da operação: puxada, armazenagem, tarefas, divergências e estornos
          </p>
        </div>
        {metrics.data && metrics.data.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            data-export-hide
            onClick={handleExportDashboard}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Baixar dashboard (PNG)
          </Button>
        ) : null}
      </div>

      <FilterBar filters={filters} onChange={setFilters} showShiftFilters />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Qtd puxada"
          value={fmtQty(totals.pullQty)}
          icon={Package}
          sub={`${fmtInt(totals.pulls)} paletes puxados`}
        />
        <Kpi
          label="Qtd. armazenada"
          value={fmtQty(totals.storeQty)}
          icon={Boxes}
          tone="success"
          sub={`${fmtInt(totals.stores)} paletes armazenados`}
        />
        <Kpi
          label="Tarefas de puxada em aberto"
          value={fmtInt(openTasks.tasksCount)}
          icon={Timer}
          tone="warning"
          sub={`${fmtInt(openTasks.ordersWithOpen)} ordens aguardando`}
          onClick={openOpenTasks}
        />
        <Kpi label="Tarefas abertas (MON)" value={fmtInt(totals.open)} icon={CircleDashed} tone="neutral" />
        <Kpi
          label="Ordens com divergência"
          value={fmtInt(divergentOrders.length)}
          icon={Scale}
          tone="warning"
          sub="Clique para abrir filtradas no relatório"
          onClick={openDivergenceAll}
        />
        <Kpi
          label="Estornos realizados"
          value={fmtInt(reversedStats.count)}
          icon={RotateCcw}
          tone={reversedStats.count > 0 ? "danger" : "neutral"}
          sub={reversedStats.qty > 0 ? `${fmtQty(reversedStats.qty)} qtd` : "nenhum"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="Puxadas × armazenagens por dia"
          sub="Por dia operacional (MON)"
          exportName={`puxadas_x_armazenagens_${debounced.period}.png`}
          exportLegend={[
            { name: "Puxadas", color: C.primary },
            { name: "Armazenagens", color: C.success },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              <Bar dataKey="pulls" name="Puxadas" fill={C.primary} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="pulls" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" formatter={(v) => fmtInt(Number(v))} />
              </Bar>
              <Bar dataKey="stores" name="Armazenagens" fill={C.success} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="stores" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" formatter={(v) => fmtInt(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Qtd movimentada (puxada + armazenagem)"
          sub="Por dia operacional"
          exportName={`qtd_movimentada_${debounced.period}.png`}
          exportLegend={[
            { name: "Qtd puxada", color: C.primary },
            { name: "Qtd armazenada", color: C.success },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              <Bar dataKey="pullQty" name="Qtd puxada" fill={C.primary} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="pullQty" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" formatter={(v) => fmtQty(Number(v))} />
              </Bar>
              <Bar dataKey="storeQty" name="Qtd armazenada" fill={C.success} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="storeQty" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" formatter={(v) => fmtQty(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Backlog de armazenagem por dia"
          sub="Puxadas sem armazenagem confirmada (saldo acumulado)"
          exportName={`backlog_${debounced.period}.png`}
          exportLegend={[{ name: "Saldo em aberto", color: C.warning }]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={backlog}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...CHART_TOOLTIP} />
              <Line type="monotone" dataKey="saldo" name="Saldo" stroke={C.warning} strokeWidth={2} dot={false}>
                <LabelList dataKey="saldo" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" formatter={(v) => fmtInt(Number(v))} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold">Resumo por turno</p>
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
                <ShiftRow key={String(s.shiftId ?? "null")} s={s} />
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

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <RotateCcw className="h-4 w-4 text-danger" /> Recebimentos estornados
            <Badge variant="danger">{fmtInt(reversedStats.count)}</Badge>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" data-export-hide onClick={() => exportReversed("excel")}>
              <SheetIcon className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" data-export-hide onClick={() => exportReversed("csv")}>
              <FileText className="h-4 w-4" /> CSV
            </Button>
          </div>
        </div>
        {reversedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum recebimento estornado no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTh label="Documento" sortKey="document_number" sort={revSort} onSort={toggleRevSort} />
                  <SortableTh label="Ordem" sortKey="production_order" sort={revSort} onSort={toggleRevSort} />
                  <SortableTh label="Material" sortKey="material_code" sort={revSort} onSort={toggleRevSort} />
                  <SortableTh label="Lote" sortKey="lot" sort={revSort} onSort={toggleRevSort} />
                  <SortableTh label="Qtd." sortKey="quantity" numeric sort={revSort} onSort={toggleRevSort} />
                  <SortableTh label="Motivo" sortKey="reversal_reason" sort={revSort} onSort={toggleRevSort} />
                  <SortableTh label="Data do estorno" sortKey="reversed_at" sort={revSort} onSort={toggleRevSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reversedRowsSorted.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.document_number}</TableCell>
                    <TableCell>{r.production_order ?? "—"}</TableCell>
                    <TableCell>{r.material_code}</TableCell>
                    <TableCell>{r.lot ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(r.quantity)}</TableCell>
                    <TableCell>{r.reversal_reason ?? "—"}</TableCell>
                    <TableCell>{fmtDateTime(r.reversed_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ShiftRow({ s }: { s: ShiftSummary }) {
  return (
    <TableRow>
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
  );
}
