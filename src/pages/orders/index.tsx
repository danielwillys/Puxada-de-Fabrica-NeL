import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, FileText, Search, Sheet as SheetIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportCsv, exportExcel, exportExcelSheets } from "@/lib/excel";
import { fmtDate, fmtDateTime, fmtPercent, fmtQty } from "@/lib/format";
import { useFilters } from "@/context/filters-context";
import { useOrdersExport, useOrdersPage } from "@/lib/queries";
import { TASK_STATUS_META, type ProductionReceipt, type WarehouseTask } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLUMNS: {
  key: string;
  label: string;
  sortable?: boolean;
  numeric?: boolean;
}[] = [
  { key: "order_number", label: "Ordem", sortable: true },
  { key: "material_code", label: "Material", sortable: true },
  { key: "material_description", label: "Descrição" },
  { key: "lot", label: "Lote" },
  { key: "unit", label: "UM" },
  { key: "planned_quantity", label: "Planejada", sortable: true, numeric: true },
  { key: "confirmed_quantity", label: "Produzida", sortable: true, numeric: true },
  { key: "required_quantity", label: "Exigida", sortable: true, numeric: true },
  { key: "sap_supplied_quantity", label: "SAP", sortable: true, numeric: true },
  { key: "pulled_quantity", label: "Puxada física", sortable: true, numeric: true },
  { key: "divergence", label: "Divergência", numeric: true },
  { key: "balance_quantity", label: "Saldo", sortable: true, numeric: true },
  { key: "excess_quantity", label: "Excesso", sortable: true, numeric: true },
  { key: "pull_efficiency_percent", label: "% puxado", sortable: true, numeric: true },
  { key: "status", label: "Status", sortable: true },
  { key: "planned_start", label: "Data planejada" },
  { key: "actual_start", label: "Início real" },
  { key: "actual_end", label: "Fim real" },
  { key: "first_pull_at", label: "1ª puxada" },
  { key: "last_pull_at", label: "Última puxada" },
];

const EXPORT_LABELS: Record<string, string> = {
  order_number: "Ordem",
  material_code: "Material",
  material_description: "Descrição",
  lot: "Lote",
  unit: "UM",
  planned_quantity: "Quantidade planejada",
  confirmed_quantity: "Quantidade boa confirmada",
  required_quantity: "Quantidade exigida",
  sap_supplied_quantity: "Qtd. fornecida (SAP)",
  pulled_quantity: "Qtd. puxada fisicamente",
  divergence: "Divergência SAP × físico",
  balance_quantity: "Saldo a puxar",
  excess_quantity: "Excesso",
  pull_efficiency_percent: "% puxado",
  status: "Status",
  created_date: "Data de criação",
  planned_start: "Data planejada",
  actual_start: "Data início real",
  actual_end: "Data real do fim",
  first_pull_at: "Primeira puxada",
  last_pull_at: "Última puxada",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Não iniciada",
  in_progress: "Em andamento",
  completed: "Finalizada",
  excess: "Excesso",
};

const ORDERS_UI_KEY = "converge.orders.ui.v1";

/** Recupera busca/página/ordenação da tela de ordens (persistem ao voltar). */
function loadOrdersUi() {
  const def = {
    search: "",
    page: 1,
    sortField: "order_number",
    sortDir: "asc" as const,
    expand: false,
  };
  try {
    const raw = localStorage.getItem(ORDERS_UI_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      search: typeof p.search === "string" ? p.search : def.search,
      page: typeof p.page === "number" && p.page >= 1 ? p.page : def.page,
      sortField: typeof p.sortField === "string" ? p.sortField : def.sortField,
      sortDir: p.sortDir === "desc" ? ("desc" as const) : ("asc" as const),
      expand: Boolean(p.expand),
    };
  } catch {
    return def;
  }
}

function cellValue(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  switch (key) {
    case "planned_quantity":
    case "confirmed_quantity":
    case "required_quantity":
    case "sap_supplied_quantity":
    case "pulled_quantity":
    case "balance_quantity":
    case "excess_quantity":
      return fmtQty(v as number);
    case "pull_efficiency_percent":
      return fmtPercent(v as number);
    case "planned_start":
    case "actual_start":
    case "actual_end":
    case "first_pull_at":
    case "last_pull_at":
      return fmtDateTime(v as string);
    case "created_date":
      return fmtDate(v as string);
    default:
      return v === null || v === undefined ? "—" : String(v);
  }
}

export function OrdersPage() {
  const navigate = useNavigate();
  const { filters, debounced, setFilters } = useFilters();
  const [initialUi] = useState(loadOrdersUi);
  const [search, setSearch] = useState(initialUi.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialUi.search);
  const [page, setPage] = useState(initialUi.page);
  const [pageSize] = useState(20);
  const [sortField, setSortField] = useState(initialUi.sortField);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialUi.sortDir);
  /** Inclui Pallets/UC e Entradas físicas (Recebimento) no relatório exportado. */
  const [expand, setExpand] = useState(initialUi.expand);

  // Persiste o estado da tela para que busca/página/ordenação voltem como estavam.
  useEffect(() => {
    localStorage.setItem(
      ORDERS_UI_KEY,
      JSON.stringify({ search, page, sortField, sortDir, expand }),
    );
  }, [search, page, sortField, sortDir, expand]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      setDebouncedSearch(search);
      return;
    }
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const orders = useOrdersPage({
    filters: debounced,
    search: debouncedSearch,
    page,
    pageSize,
    sortField,
    sortDir,
  });
  const exportQuery = useOrdersExport(debounced, debouncedSearch);

  const totalPages = Math.max(1, Math.ceil((orders.data?.count ?? 0) / pageSize));

  // Corrige a página restaurada caso a filtragem reduza o total de páginas.
  useEffect(() => {
    const count = orders.data?.count;
    if (typeof count === "number" && count > 0) {
      const max = Math.max(1, Math.ceil(count / pageSize));
      if (page > max) setPage(max);
    }
  }, [orders.data, page, pageSize]);

  const toggleSort = (key: string) => {
    if (sortField === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleExport = async (format: "excel" | "csv") => {
    const rows = exportQuery.data ?? [];
    const ordersSheet = rows.map((r) => {
      const o: Record<string, string> = {};
      for (const key of Object.keys(EXPORT_LABELS)) {
        const value = (r as unknown as Record<string, unknown>)[key];
        o[EXPORT_LABELS[key]] =
          key === "status"
            ? STATUS_LABELS[String(value ?? "")] ?? "—"
            : cellValue(r as unknown as Record<string, unknown>, key);
      }
      return o;
    });
    const base = `ordens_${debounced.period}_${new Date().toISOString().slice(0, 10)}`;

    if (!expand) {
      if (format === "excel") exportExcel(`${base}.xlsx`, ordersSheet);
      else exportCsv(`${base}.csv`, ordersSheet);
      return;
    }

    // Relatório expandido: traz junto os Pallets/UC e as Entradas físicas das
    // ordens filtradas, sem exportar outro arquivo separadamente.
    try {
      const nums = rows.map((r) => r.order_number);
      const tasks: WarehouseTask[] = [];
      const receipts: ProductionReceipt[] = [];
      for (let i = 0; i < nums.length; i += 100) {
        const chunk = nums.slice(i, i + 100);
        const [tRes, rRes] = await Promise.all([
          supabase.from("warehouse_tasks").select("*").in("production_order", chunk),
          supabase.from("production_receipts").select("*").in("production_order", chunk),
        ]);
        if (tRes.error) throw tRes.error;
        if (rRes.error) throw rRes.error;
        tasks.push(...((tRes.data ?? []) as WarehouseTask[]));
        receipts.push(...((rRes.data ?? []) as ProductionReceipt[]));
      }

      const ucRows = tasks
        .filter((t) => t.process_type === "1020")
        .map((t) => ({
          Ordem: t.production_order ?? "",
          UC: t.source_uc ?? "",
          Documento: t.document ?? "",
          Material: t.material_code ?? "",
          Descrição: t.material_description ?? "",
          Lote: t.lot ?? "",
          "PD destino": t.pd_destino ?? "",
          Quantidade: t.quantity,
          UM: t.unit ?? "",
          Status: t.reversed_at
            ? `Estornado${t.reversal_reason ? ` (${t.reversal_reason})` : ""}`
            : (TASK_STATUS_META[t.task_status ?? ""]?.label ?? t.task_status ?? ""),
          "Puxada por": t.author ?? "",
          "Puxada em": t.creation_date
            ? `${t.creation_date}${t.creation_time ? " " + t.creation_time : ""}`
            : "",
          "Armazenado por": t.confirmed_by ?? "",
          "Armazenagem em": t.confirmation_date
            ? `${t.confirmation_date}${t.confirmation_time ? " " + t.confirmation_time : ""}`
            : "",
        }));

      const rcRows = receipts.map((r) => ({
        Ordem: r.production_order,
        Documento: r.document_number,
        Produto: r.material_code,
        Descrição: r.material_description ?? "",
        Lote: r.lot ?? "",
        Quantidade: r.quantity,
        UM: r.unit ?? "",
        "EM (data)": fmtDate(r.goods_receipt_date),
        "EM (hora)": r.goods_receipt_time ?? "",
        "Depósito (data)": fmtDate(r.storage_date),
        "Depósito (hora)": r.storage_time ?? "",
        Válido: r.is_valid ? "Sim" : "Não (estornado)",
        "Motivo do estorno": r.reversal_reason ?? "",
        "Data do estorno": fmtDateTime(r.reversed_at),
      }));

      if (format === "excel") {
        exportExcelSheets(`${base}_expandido.xlsx`, [
          { name: "Ordens", rows: ordersSheet },
          { name: "Pallets / UC", rows: ucRows },
          { name: "Entradas físicas", rows: rcRows },
        ]);
      } else {
        const flat = [
          ...ordersSheet.map((o) => ({ Tipo: "Ordem", ...o })),
          ...ucRows.map((u) => ({ Tipo: "UC", ...u })),
          ...rcRows.map((r) => ({ Tipo: "Recebimento", ...r })),
        ];
        exportCsv(`${base}_expandido.csv`, flat);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível gerar o relatório expandido.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ordens de Produção</h1>
        <p className="text-sm text-muted-foreground">
          Planejado · Produzido · Exigido · SAP · Puxado físico · Saldo · Excesso
        </p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} showOpenTasks />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar ordem, material, descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="ml-auto flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground">
          <Switch checked={expand} onCheckedChange={setExpand} />
          Expandir dados (incluir Pallets/UC e Entradas físicas)
        </label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("excel")}>
            <SheetIcon className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <FileText className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {orders.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((c) => (
                      <TableHead
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap",
                          c.numeric && "text-right",
                          c.sortable && "cursor-pointer select-none",
                        )}
                        onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {c.label}
                          {sortField === c.key ? (
                            sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : c.sortable ? (
                            <ChevronDown className="h-3 w-3 opacity-30" />
                          ) : null}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(orders.data?.rows ?? [])
                    .filter((row) => {
                      if (!filters.divergence) return true;
                      const d = row.pulled_quantity - row.sap_supplied_quantity;
                      if (filters.divergence === "positive") return d > 0.001;
                      if (filters.divergence === "negative") return d < -0.001;
                      if (filters.divergence === "all") return Math.abs(d) > 0.001;
                      return Math.abs(d) <= 0.001;
                    })
                    .map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/ordens/${encodeURIComponent(row.order_number)}`)}
                    >
                      <TableCell className="font-medium text-primary">{row.order_number}</TableCell>
                      <TableCell>{row.material_code}</TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        {row.material_description ?? "—"}
                      </TableCell>
                      <TableCell>{row.lot ?? "—"}</TableCell>
                      <TableCell>{row.unit ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtQty(row.planned_quantity)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtQty(row.confirmed_quantity)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtQty(row.required_quantity)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtQty(row.sap_supplied_quantity)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtQty(row.pulled_quantity)}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const d = row.pulled_quantity - row.sap_supplied_quantity;
                          return (
                            <span
                              className={
                                Math.abs(d) <= 0.001
                                  ? "text-success"
                                  : d > 0
                                    ? "text-warning"
                                    : "text-danger"
                              }
                            >
                              {fmtQty(d)}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtQty(row.balance_quantity)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtQty(row.excess_quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPercent(row.pull_efficiency_percent)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(row.planned_start)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(row.actual_start)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(row.actual_end)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(row.first_pull_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(row.last_pull_at)}</TableCell>
                    </TableRow>
                  ))}
                  {(orders.data?.rows ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-muted-foreground">
                        Nenhum dado disponível para o período selecionado.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {filters.divergence &&
                  (orders.data?.rows ?? []).length > 0 &&
                  (orders.data?.rows ?? []).filter((row) => {
                    const d = row.pulled_quantity - row.sap_supplied_quantity;
                    if (filters.divergence === "positive") return d > 0.001;
                    if (filters.divergence === "negative") return d < -0.001;
                    if (filters.divergence === "all") return Math.abs(d) > 0.001;
                    return Math.abs(d) <= 0.001;
                  }).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-muted-foreground">
                        Nenhuma ordem com essa divergência no período selecionado.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {orders.data ? `${fmtQty((orders.data.count ?? 0))} ordens` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
