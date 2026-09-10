import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, FileText, Search, Sheet as SheetIcon } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { fmtDate, fmtDateTime, fmtPercent, fmtQty } from "@/lib/format";
import { EMPTY_FILTERS, useDebouncedFilters, useOrdersExport, useOrdersPage } from "@/lib/queries";
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
  const [params] = useSearchParams();
  const initialStatus = (params.get("status") ?? "") as string;
  const { filters, debounced, setFilters } = useDebouncedFilters({
    ...EMPTY_FILTERS,
    status: (["not_started", "in_progress", "completed", "excess"] as const).includes(
      initialStatus as never,
    )
      ? (initialStatus as "not_started")
      : "",
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sortField, setSortField] = useState("order_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
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

  const toggleSort = (key: string) => {
    if (sortField === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleExport = (format: "excel" | "csv") => {
    const rows = exportQuery.data ?? [];
    const out = rows.map((r) => {
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
    if (format === "excel") exportExcel(`${base}.xlsx`, out);
    else exportCsv(`${base}.csv`, out);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ordens de Produção</h1>
        <p className="text-sm text-muted-foreground">
          Planejado · Produzido · Exigido · SAP · Puxado físico · Saldo · Excesso
        </p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

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
        <div className="ml-auto flex gap-2">
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
                  {(orders.data?.rows ?? []).map((row) => (
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
                      {[
                        row.planned_quantity,
                        row.confirmed_quantity,
                        row.required_quantity,
                        row.sap_supplied_quantity,
                        row.pulled_quantity,
                        row.balance_quantity,
                        row.excess_quantity,
                      ].map((v, i) => (
                        <TableCell key={i} className="whitespace-nowrap text-right tabular-nums">
                          {fmtQty(v)}
                        </TableCell>
                      ))}
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
