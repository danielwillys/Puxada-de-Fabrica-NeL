import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  Clock,
  Factory,
  FileText,
  Flag,
  History,
  Hourglass,
  Loader2,
  Package,
  RotateCcw,
  Scale,
  Sheet as SheetIcon,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usePermission } from "@/context/auth-context";
import { StatusBadge, TaskStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fmtDate,
  fmtDateTime,
  fmtDurationMinutes,
  fmtQty,
  minutesBetween,
  parseLocalDateTime,
} from "@/lib/format";
import { exportCsv, exportExcel } from "@/lib/excel";
import { buildUcView } from "@/lib/uc-view";
import { sortRows, type SortState } from "@/lib/sort";
import { SortableTh } from "@/components/sortable-th";
import { useOrderMetrics, useOrderReceipts, useOrderTasks, useOrderTimeline } from "@/lib/queries";
import type { ProductionReceipt } from "@/lib/types";
import { TASK_STATUS_META } from "@/lib/types";
import { cn } from "@/lib/utils";

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
function TimelineStep({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "done" | "pending" | "muted";
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
            state === "done" && "border-success bg-success/10 text-success",
            state === "pending" && "border-warning bg-warning/10 text-warning",
            state === "muted" && "border-border bg-muted text-muted-foreground",
          )}
        >
          <CheckCircle2
            className={cn("h-3.5 w-3.5", state !== "done" && "opacity-50")}
          />
        </span>
        <span className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="flex flex-1 flex-col pb-5">
        <p className="text-sm font-medium">{label}</p>
        <p
          className={cn(
            "text-sm tabular-nums",
            state === "muted" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function OrderDetail() {
  const { orderNumber = "" } = useParams();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const canReversal = usePermission("orders:reversal");
  const canReversalAction = isAdmin || canReversal;
  const canNormalize = usePermission("orders:normalize");
  const canNormalizeAction = isAdmin || canNormalize;
  const metrics = useOrderMetrics(orderNumber);
  const receipts = useOrderReceipts(orderNumber);
  const tasks = useOrderTasks(orderNumber);
  const timeline = useOrderTimeline(orderNumber);
  const qc = useQueryClient();

  const [receiptAction, setReceiptAction] = useState<{
    receipt: ProductionReceipt;
    reason: string;
    estornoDocument: string;
  } | null>(null);

  const [normalizeOpen, setNormalizeOpen] = useState(false);
  const [normalizeObs, setNormalizeObs] = useState("");
  const [normalizeQty, setNormalizeQty] = useState("");

  const toggleNormalize = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const qty = normalizeQty.trim() === "" ? null : Number(normalizeQty);
      const { data, error } = await supabase.rpc("normalize_order_saldo", {
        p_order_number: orderNumber,
        p_observation: normalizeObs,
        p_quantity: qty,
      });
      if (error) throw error;
      if (data && data !== "ok") throw new Error(String(data));
    },
    onSuccess: () => {
      toast.success(row?.normalized_saldo ? "Normalização removida." : "Saldo normalizado (divergência tratada).");
      setNormalizeOpen(false);
      setNormalizeObs("");
      setNormalizeQty("");
      qc.invalidateQueries({ queryKey: ["order-metrics", orderNumber] });
      qc.invalidateQueries({ queryKey: ["order-timeline", orderNumber] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível normalizar."),
  });

  const toggleReceipt = useMutation({
    mutationFn: async (r: ProductionReceipt) => {
      const { data, error } = await supabase.rpc("set_receipt_valid", {
        p_receipt_id: r.id,
        p_valid: !r.is_valid,
        p_motivo: r.is_valid ? receiptAction?.reason ?? null : null,
        p_estorno_document: r.is_valid ? receiptAction?.estornoDocument ?? null : null,
      });
      if (error) throw error;
      if (data && data !== "ok") throw new Error(String(data));
    },
    onSuccess: () => {
      toast.success(receiptAction?.receipt.is_valid ? "Recebimento reativado." : "Recebimento estornado.");
      setReceiptAction(null);
      qc.invalidateQueries({ queryKey: ["order-receipts", orderNumber] });
      qc.invalidateQueries({ queryKey: ["order-metrics", orderNumber] });
      qc.invalidateQueries({ queryKey: ["order-timeline", orderNumber] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) =>
      toast.error(
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: string }).message)
          : "Não foi possível atualizar o recebimento.",
      ),
  });

  const row = metrics.data;
  const receiptList = useMemo(() => receipts.data ?? [], [receipts.data]);
  // "Pallets / UC da ordem": somente UCs confirmadas à armazenagem (ou estornadas
  // pelo painel). Tarefas estornadas no relatório (task_status='A') são ocultadas.
  const ucRows = useMemo(() => buildUcView(tasks.data ?? []), [tasks.data]);

  const [ucSort, setUcSort] = useState<SortState>({ key: "uc", dir: "asc" });
  const [recSort, setRecSort] = useState<SortState>({ key: "document_number", dir: "asc" });

  const ucRowsSorted = useMemo(
    () => sortRows(ucRows as unknown as Record<string, unknown>[], ucSort),
    [ucRows, ucSort],
  );
  const receiptListSorted = useMemo(
    () => sortRows(receiptList as unknown as Record<string, unknown>[], recSort),
    [receiptList, recSort],
  );

  const toggleSort = (setter: (s: SortState) => void, sort: SortState, key: string) => {
    setter(
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  const lastStorageAt = useMemo(() => {
    let max: Date | null = null;
    for (const r of receiptList) {
      const d = parseLocalDateTime(r.storage_date, r.storage_time);
      if (d && (!max || d > max)) max = d;
    }
    return max;
  }, [receiptList]);

  const exportUcs = (format: "excel" | "csv") => {
    const out = ucRowsSorted.map((r) => ({
      UC: r.uc ?? "",
      Documento: r.document ?? "",
      Material: r.material ?? "",
      Descrição: r.description ?? "",
      Lote: r.lot ?? "",
      "PD destino": r.pdDestino ?? "",
      Quantidade: r.quantity,
      UM: r.unit ?? "",
      Status: r.panelReversed
        ? `Estornado${r.reversalReason ? ` (${r.reversalReason})` : ""}`
        : (TASK_STATUS_META[r.status ?? ""]?.label ?? r.status ?? ""),
      "Puxada por": r.pullAuthor ?? "",
      "Puxada em": r.pullAt ? fmtDateTime(r.pullAt) : "",
      "Armazenado por": r.storageBy ?? "",
      "Armazenagem em": r.storageAt ? fmtDateTime(r.storageAt) : "",
      "Espera (min)": r.waitMinutes !== null ? Math.round(r.waitMinutes) : "",
    }));
    const base = `ordem_${orderNumber}_ucs_${new Date().toISOString().slice(0, 10)}`;
    if (format === "excel") exportExcel(`${base}.xlsx`, out);
    else exportCsv(`${base}.csv`, out);
  };

  const exportReceipts = (format: "excel" | "csv") => {
    const out = receiptListSorted.map((r) => ({
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
    const base = `ordem_${orderNumber}_recebimentos_${new Date().toISOString().slice(0, 10)}`;
    if (format === "excel") exportExcel(`${base}.xlsx`, out);
    else exportCsv(`${base}.csv`, out);
  };

  if (metrics.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          to="/ordens"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para ordens
        </Link>
        <Card className="p-8 text-center text-muted-foreground">
          Ordem {orderNumber} não encontrada.
        </Card>
      </div>
    );
  }

  const timeToFirstPull =
    row.first_pull_at && row.actual_start
      ? minutesBetween(new Date(row.actual_start), new Date(row.first_pull_at))
      : null;
  const totalPullTime =
    row.first_pull_at && row.last_pull_at
      ? minutesBetween(new Date(row.first_pull_at), new Date(row.last_pull_at))
      : null;
  const pullDone = row.pulled_quantity >= row.required_quantity;

  const steps = [
    {
      label: "Criação da ordem",
      value: fmtDateTime(row.created_date),
      state: row.created_date ? "done" : "muted",
    },
    {
      label: "Produção planejada",
      value: fmtDateTime(row.planned_start),
      state: row.planned_start ? "done" : "muted",
    },
    {
      label: "Início da produção",
      value: fmtDateTime(row.actual_start),
      state: row.actual_start ? "done" : "muted",
    },
    {
      label: "Fim da produção",
      value: fmtDateTime(row.actual_end),
      state: row.actual_end ? "done" : "muted",
    },
    {
      label: "Primeira puxada",
      value: fmtDateTime(row.first_pull_at),
      state: row.first_pull_at ? "done" : "muted",
    },
    {
      label: "Última puxada",
      value: fmtDateTime(row.last_pull_at),
      state: row.last_pull_at ? "done" : "muted",
    },
    {
      label: "Conclusão da puxada",
      value: pullDone ? "Puxada completa" : "Aguardando quantidade exigida",
      state: pullDone ? "done" : "pending",
    },
    {
      label: "Última armazenagem",
      value: fmtDateTime(lastStorageAt?.toISOString()),
      state: lastStorageAt ? "done" : "muted",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/ordens"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          Ordem {row.order_number}
        </h1>
        <StatusBadge status={row.status} />
        <div className="flex gap-2">
          {row.normalized_saldo ? (
            <Badge variant="info" title={row.normalized_reason ?? undefined}>
              <Scale className="h-3 w-3" /> Saldo normalizado
            </Badge>
          ) : null}
          {canNormalizeAction ? (
            <Button
              variant={row.normalized_saldo ? "outline" : "secondary"}
              size="sm"
              className="h-8"
              onClick={() => {
                if (row.normalized_saldo) toggleNormalize.mutate();
                else setNormalizeOpen(true);
              }}
            >
              <Scale className="h-3.5 w-3.5" />
              {row.normalized_saldo ? "Remover normalização" : "Normalizar saldo"}
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Factory className="h-4 w-4 text-primary" /> Resumo
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <SummaryItem label="Material" value={row.material_code} />
          <SummaryItem label="Descrição" value={row.material_description ?? "—"} />
          <SummaryItem label="Lote" value={row.lot ?? "—"} />
          <SummaryItem label="Unidade" value={row.unit ?? "—"} />
          <SummaryItem label="Planejada" value={fmtQty(row.planned_quantity)} />
          <SummaryItem label="Produzida" value={fmtQty(row.confirmed_quantity)} />
          <SummaryItem label="Exigida" value={fmtQty(row.required_quantity)} />
          <SummaryItem label="Qtd. fornecida (SAP)" value={fmtQty(row.sap_supplied_quantity)} />
          <SummaryItem label="Puxada física" value={fmtQty(row.pulled_quantity)} />
          <SummaryItem label="Saldo" value={fmtQty(row.balance_quantity)} />
          <SummaryItem label="Excesso" value={fmtQty(row.excess_quantity)} />
          <SummaryItem label="% puxado" value={`${row.pull_efficiency_percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} />
          <SummaryItem label="Data planejada" value={fmtDateTime(row.planned_start)} />
          <SummaryItem label="Início real" value={fmtDateTime(row.actual_start)} />
          <SummaryItem label="Fim real" value={fmtDateTime(row.actual_end)} />
          <SummaryItem label="1ª puxada" value={fmtDateTime(row.first_pull_at)} />
          <SummaryItem label="Última puxada" value={fmtDateTime(row.last_pull_at)} />
          <SummaryItem
            label="Tempo até 1ª puxada"
            value={fmtDurationMinutes(timeToFirstPull)}
          />
          <SummaryItem
            label="Tempo total de puxada"
            value={fmtDurationMinutes(totalPullTime)}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" /> Linha do tempo
          </p>
          <div className="flex flex-col">
            {steps.map((s) => (
              <TimelineStep key={s.label} {...s} />
            ))}
          </div>

          {(timeline.data ?? []).length > 0 ? (
            <div className="mt-2 border-t pt-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 text-primary" /> Movimentações
              </p>
              <div className="flex max-h-72 flex-col gap-1.5 overflow-auto">
                {(timeline.data ?? []).map((e) => {
                  const label =
                    e.action === "normalizar_saldo"
                      ? "Normalização de saldo"
                      : e.action === "remover_normalizacao"
                        ? "Normalização removida"
                        : e.action === "estornar_recebimento"
                          ? "Estorno"
                          : "Reativação";
                  const tone =
                    e.action === "estornar_recebimento"
                      ? "danger"
                      : e.action === "reativar_recebimento" || e.action === "normalizar_saldo"
                        ? "success"
                        : "warning";
                  return (
                    <div key={e.id} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={tone as "danger" | "success" | "warning"}>{label}</Badge>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDateTime(e.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.description ?? "—"}
                        {e.quantity != null ? ` · ${fmtQty(e.quantity)} itens` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        por {e.user_name ?? e.user_id ?? "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Boxes className="h-4 w-4 text-primary" /> Pallets / UC da ordem
              <Badge variant="secondary">{ucRows.length}</Badge>
            </p>
            {ucRows.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportUcs("excel")}>
                  <SheetIcon className="h-4 w-4" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportUcs("csv")}>
                  <FileText className="h-4 w-4" /> CSV
                </Button>
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTh label="UC" sortKey="uc" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Documento" sortKey="document" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Material" sortKey="material" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Lote" sortKey="lot" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="PD destino" sortKey="pdDestino" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Qtd." sortKey="quantity" numeric sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="UM" sortKey="unit" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Status" sortKey="status" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Puxada" sortKey="pullAt" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Armazenagem" sortKey="storageAt" sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                  <SortableTh label="Espera" sortKey="waitMinutes" numeric sort={ucSort} onSort={(k) => toggleSort(setUcSort, ucSort, k)} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ucRowsSorted.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.uc ?? "—"}</TableCell>
                    <TableCell>{r.document ?? "—"}</TableCell>
                    <TableCell>{r.material ?? "—"}</TableCell>
                    <TableCell>{r.lot ?? "—"}</TableCell>
                    <TableCell>{r.pdDestino ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(r.quantity)}</TableCell>
                    <TableCell>{r.unit ?? "—"}</TableCell>
                    <TableCell>
                      {r.panelReversed ? (
                        <Badge variant="danger" title={r.reversalReason ?? undefined}>
                          Estornado
                        </Badge>
                      ) : (
                        <TaskStatusBadge status={r.status} />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <User className="h-3 w-3" />
                        {r.pullAuthor ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(r.pullAt)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <User className="h-3 w-3" />
                        {r.storageBy ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(r.storageAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.waitMinutes !== null ? fmtDurationMinutes(r.waitMinutes) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {ucRowsSorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                      Nenhuma UC confirmada à armazenagem para esta ordem.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4 text-primary" /> Entradas físicas (Recebimento)
            <Badge variant="secondary">{receiptList.length}</Badge>
          </p>
          {receiptList.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportReceipts("excel")}>
                <SheetIcon className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportReceipts("csv")}>
                <FileText className="h-4 w-4" /> CSV
              </Button>
            </div>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTh label="Documento" sortKey="document_number" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="Produto" sortKey="material_code" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="Descrição" sortKey="material_description" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="Lote" sortKey="lot" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="Qtd." sortKey="quantity" numeric sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="UM" sortKey="unit" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="EM (data)" sortKey="goods_receipt_date" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="EM (hora)" sortKey="goods_receipt_time" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="Depósito (data)" sortKey="storage_date" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="Depósito (hora)" sortKey="storage_time" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <SortableTh label="Válido" sortKey="is_valid" sort={recSort} onSort={(k) => toggleSort(setRecSort, recSort, k)} />
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receiptListSorted.map((r) => (
                <TableRow key={r.id} className={cn(!r.is_valid && "bg-danger/5")}>
                  <TableCell className="font-medium">{r.document_number}</TableCell>
                  <TableCell>{r.material_code}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {r.material_description ?? "—"}
                  </TableCell>
                  <TableCell>{r.lot ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(r.quantity)}</TableCell>
                  <TableCell>{r.unit ?? "—"}</TableCell>
                  <TableCell>{fmtDate(r.goods_receipt_date)}</TableCell>
                  <TableCell>{r.goods_receipt_time ?? "—"}</TableCell>
                  <TableCell>{fmtDate(r.storage_date)}</TableCell>
                  <TableCell>{r.storage_time ?? "—"}</TableCell>
                  <TableCell>
                    {r.is_valid ? (
                      <Badge variant="success">Sim</Badge>
                    ) : (
                      <Badge variant="danger" title={r.reversal_reason ?? undefined}>
                        Estornado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canReversalAction ? (
                      <Button
                        variant={r.is_valid ? "outline" : "ghost"}
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          setReceiptAction({
                            receipt: r,
                            reason: "Excesso de material",
                            estornoDocument: "",
                          })
                        }
                      >
                        {r.is_valid ? (
                          <>
                            <RotateCcw className="h-3.5 w-3.5" /> Estornar
                          </>
                        ) : (
                          <>
                            <ArrowLeftRight className="h-3.5 w-3.5" /> Reativar
                          </>
                        )}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {receiptList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                    Nenhum recebimento vinculado a esta ordem.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Estorno / reativação de recebimento */}
      <Dialog open={Boolean(receiptAction)} onOpenChange={(o) => (o ? null : setReceiptAction(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {receiptAction?.receipt.is_valid ? "Estornar recebimento" : "Reativar recebimento"}
            </DialogTitle>
            <DialogDescription>
              {receiptAction?.receipt.is_valid ? (
                <>
                  Documento <strong>{receiptAction.receipt.document_number}</strong> ·{" "}
                  {fmtQty(receiptAction.receipt.quantity)} {receiptAction.receipt.unit ?? ""}. O
                  palete estornado deixa de contar no saldo da ordem (material devolvido à
                  produção). A operação é registrada na auditoria.
                </>
              ) : (
                <>Reativa o documento <strong>{receiptAction?.receipt.document_number}</strong> para contabilização novamente.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {receiptAction?.receipt.is_valid ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Motivo do estorno</Label>
                <Select
                  value={receiptAction.reason}
                  onValueChange={(v) => setReceiptAction({ ...receiptAction, reason: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Excesso de material">Excesso de material</SelectItem>
                    <SelectItem value="Recebimento errado">Recebimento errado</SelectItem>
                    <SelectItem value="Devolução à produção">Devolução à produção</SelectItem>
                    <SelectItem value="Divergência de quantidade">Divergência de quantidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Número do documento de estorno (SAP)</Label>
                <Input
                  value={receiptAction.estornoDocument}
                  onChange={(e) =>
                    setReceiptAction({ ...receiptAction, estornoDocument: e.target.value })
                  }
                  placeholder="Ex.: 1000001234"
                />
                <p className="text-xs text-muted-foreground">
                  Obrigatório: fica registrado na linha do tempo da ordem.
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptAction(null)}>
              Cancelar
            </Button>
            <Button
              variant={receiptAction?.receipt.is_valid ? "destructive" : "default"}
              onClick={() => receiptAction && toggleReceipt.mutate(receiptAction.receipt)}
              disabled={
                toggleReceipt.isPending ||
                !receiptAction?.reason ||
                (receiptAction?.receipt.is_valid && !receiptAction.estornoDocument.trim())
              }
            >
              {toggleReceipt.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : receiptAction?.receipt.is_valid ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" />
              )}
              {receiptAction?.receipt.is_valid ? "Confirmar estorno" : "Reativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Normalização de saldo (divergência SAP × físico analisada e aceita) */}
      <Dialog open={normalizeOpen} onOpenChange={setNormalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Normalizar saldo da ordem</DialogTitle>
            <DialogDescription>
              A divergência tratada <strong>deixa de existir</strong> no sistema: a ordem deixa
              de contar como "Com excesso", com saldo pendente ou divergência SAP. A
              movimentação fica registrada na linha do tempo com o usuário que fez.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Observação / Motivo (obrigatório)</Label>
              <Textarea
                value={normalizeObs}
                onChange={(e) => setNormalizeObs(e.target.value)}
                rows={3}
                placeholder="Ex.: Saldo SAP maior que o puxado fisicamente — zerando a divergência."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Quantidade de itens normalizados</Label>
              <Input
                type="number"
                min={0}
                value={normalizeQty}
                onChange={(e) => setNormalizeQty(e.target.value)}
                placeholder="Ex.: 65"
                className="w-40 tabular-nums"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNormalizeOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => toggleNormalize.mutate()}
              disabled={toggleNormalize.isPending || !normalizeObs.trim()}
            >
              {toggleNormalize.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scale className="h-4 w-4" />
              )}
              Confirmar normalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
