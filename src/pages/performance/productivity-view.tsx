import { useMemo } from "react";
import { BarChart3, Gauge, UsersRound } from "lucide-react";
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
  useOperatorShiftHistory,
  usePerformanceTasks,
  useShifts,
  type GlobalFilters,
} from "@/lib/queries";
import {
  buildCoverage,
  buildPullHeatmap,
} from "@/lib/performance";
import { fmtInt, fmtPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const C = {
  primary: "#2563eb",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#dc2626",
  muted: "#94a3b8",
};

function shiftColor(i: number) {
  const palette = [C.primary, C.success, C.warning, "#8b5cf6", C.danger, C.muted];
  return palette[i % palette.length];
}

interface HeatRow {
  shiftId: number | null;
  code: string;
  cells: Map<number, number>;
  total: number;
}

export function ProductivityView({ filters }: { filters: GlobalFilters }) {
  const tasks = usePerformanceTasks(filters);
  const shifts = useShifts();
  const history = useOperatorShiftHistory();

  const shiftInputs = useMemo(
    () =>
      (shifts.data ?? [])
        .filter((s) => s.active)
        .map((s) => ({ id: s.id, code: s.code, name: s.name })),
    [shifts.data],
  );

  const heat = useMemo(() => {
    const { cells } = buildPullHeatmap(tasks.data ?? [], shiftInputs);
    const rows: HeatRow[] = shiftInputs.map((s) => ({
      shiftId: s.id,
      code: s.code,
      cells: new Map<number, number>(),
      total: 0,
    }));
    for (const c of cells) {
      const row = rows.find((r) => r.shiftId === c.shiftId);
      if (!row) continue;
      row.cells.set(c.hour, (row.cells.get(c.hour) ?? 0) + c.count);
      row.total += c.count;
    }
    const maxCell = Math.max(1, ...rows.flatMap((r) => [...r.cells.values()]));
    return { rows, maxCell };
  }, [tasks.data, shiftInputs]);

  // Produtividade normalizada: paletes puxados por operador ativo, e por hora
  // operada (total de horas dos turnos no período por operador alocado).
  const productivity = useMemo(() => {
    const byShift = new Map<number, { ops: Set<number>; pulls: number; hours: number }>();
    for (const t of tasks.data ?? []) {
      if (t.process_type !== "1020" || t.pull_shift_id === null) continue;
      const id = t.pull_shift_id;
      const cur = byShift.get(id) ?? { ops: new Set<number>(), pulls: 0, hours: 8 };
      cur.pulls += 1;
      if (t.pull_operator_id !== null) cur.ops.add(t.pull_operator_id);
      byShift.set(id, cur);
    }
    // hours per shift = span between start/end (min hours 1)
    for (const s of shiftInputs) {
      const shift = (shifts.data ?? []).find((x) => x.id === s.id);
      const cur = byShift.get(s.id ?? -1);
      if (!shift || !shift.start_time || !shift.end_time) continue;
      const startH = Number(shift.start_time.slice(0, 2)) + Number(shift.start_time.slice(3, 5)) / 60;
      const endH = Number(shift.end_time.slice(0, 2)) + Number(shift.end_time.slice(3, 5)) / 60;
      const span = shift.crosses_midnight ? endH + 24 - startH : endH - startH;
      if (cur) cur.hours = Math.max(1, span);
    }
    return { byShift };
  }, [tasks.data, shiftInputs, shifts.data]);

  const coverage = useMemo(
    () => buildCoverage(tasks.data ?? [], shiftInputs, history.data ?? []),
    [tasks.data, shiftInputs, history.data],
  );

  const coverageTotals = useMemo(() => {
    let allocated = 0;
    let worked = 0;
    for (const c of coverage) {
      allocated += c.allocated;
      worked += c.worked;
    }
    return {
      allocated,
      worked,
      pct: allocated > 0 ? Math.round((worked / allocated) * 100) : 0,
    };
  }, [coverage]);

  if (tasks.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-72 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" /> Heatmap de produtividade
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          Número de puxadas por hora do dia e por turno (hora da criação da tarefa)
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[90px_repeat(24,1fr)] gap-1">
              <div />
              {hours.map((h) => (
                <div
                  key={h}
                  className="text-center text-[10px] font-medium text-muted-foreground"
                >
                  {h}
                </div>
              ))}
              {heat.rows.map((row, ri) => (
                <RowCells key={row.code} row={row} ri={ri} maxCell={heat.maxCell} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-primary" /> Produtividade normalizada
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Puxadas por operador e estimativa por hora de turno (paletes/hora)
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Turno</TableHead>
                  <TableHead>Operadores</TableHead>
                  <TableHead>Puxadas</TableHead>
                  <TableHead>Puxadas / operador</TableHead>
                  <TableHead>Horas / dia</TableHead>
                  <TableHead>Puxadas / hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shiftInputs.map((s, i) => {
                  const pd = productivity.byShift.get(s.id ?? -1);
                  if (!pd) return null;
                  const ops = Math.max(1, pd.ops.size);
                  const perOp = pd.pulls / ops;
                  const perHour = pd.hours > 0 ? pd.pulls / (ops * pd.hours) : 0;
                  return (
                    <TableRow key={s.code}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: shiftColor(i) }}
                          />
                          {s.name}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{fmtInt(ops)}</TableCell>
                      <TableCell className="tabular-nums">{fmtInt(pd.pulls)}</TableCell>
                      <TableCell className="tabular-nums">
                        {perOp.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {pd.hours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </TableCell>
                      <TableCell className="tabular-nums font-semibold">
                        {perHour.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {shiftInputs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      Nenhum turno cadastrado.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <UsersRound className="h-4 w-4 text-primary" /> Cobertura de operadores
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Operadores alocados por turno (escala) × operadores que efetivamente
            movimentaram paletes no período
          </p>
          <div className="grid grid-cols-3 gap-2">
            <CoverageKpi label="Alocados" value={fmtInt(coverageTotals.allocated)} tone="default" />
            <CoverageKpi label="Atuaram" value={fmtInt(coverageTotals.worked)} tone="success" />
            <CoverageKpi label="Cobertura" value={fmtPercent(coverageTotals.pct)} tone="info" />
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Alocados</TableHead>
                  <TableHead>Atuaram</TableHead>
                  <TableHead>Cobertura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.map((c) => (
                  <TableRow key={`${c.day}-${c.shiftId}`}>
                    <TableCell className="tabular-nums">{c.day}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.shiftCode}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{fmtInt(c.allocated)}</TableCell>
                    <TableCell className="tabular-nums">{fmtInt(c.worked)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.coveragePct >= 80
                            ? "success"
                            : c.coveragePct >= 50
                              ? "warning"
                              : "danger"
                        }
                      >
                        {fmtPercent(c.coveragePct)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {coverage.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      Sem dados no período.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RowCells({
  row,
  ri,
  maxCell,
}: {
  row: HeatRow;
  ri: number;
  maxCell: number;
}) {
  const color = shiftColor(ri);
  return (
    <>
      <div className="flex items-center text-xs font-medium text-muted-foreground">
        {row.code}
      </div>
      {Array.from({ length: 24 }, (_, h) => {
        const v = row.cells.get(h) ?? 0;
        const intensity = v === 0 ? 0 : 0.12 + (v / maxCell) * 0.88;
        return (
          <div
            key={h}
            title={`${row.code} ${String(h).padStart(2, "0")}h — ${v} puxadas`}
            className={cn(
              "flex h-8 items-center justify-center rounded text-[10px] font-semibold tabular-nums",
              v === 0 ? "bg-muted/40 text-muted-foreground/40" : "text-white",
            )}
            style={v === 0 ? undefined : { background: color, opacity: intensity }}
          >
            {v > 0 ? v : ""}
          </div>
        );
      })}
    </>
  );
}

function CoverageKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "info";
}) {
  const cls =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "info"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
