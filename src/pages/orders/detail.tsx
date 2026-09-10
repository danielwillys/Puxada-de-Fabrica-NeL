import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Clock,
  Factory,
  Flag,
  Hourglass,
  Package,
  User,
} from "lucide-react";
import { StatusBadge, TaskStatusBadge } from "@/components/status-badge";
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
  fmtDate,
  fmtDateTime,
  fmtDurationMinutes,
  fmtQty,
  minutesBetween,
  parseLocalDateTime,
} from "@/lib/format";
import { useOrderMetrics, useOrderReceipts, useOrderTasks } from "@/lib/queries";
import type { WarehouseTask } from "@/lib/types";
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

function taskPullAt(t: WarehouseTask): Date | null {
  return parseLocalDateTime(t.creation_date, t.creation_time);
}
function taskStorageAt(t: WarehouseTask): Date | null {
  return parseLocalDateTime(t.confirmation_date, t.confirmation_time);
}

export function OrderDetail() {
  const { orderNumber = "" } = useParams();
  const metrics = useOrderMetrics(orderNumber);
  const receipts = useOrderReceipts(orderNumber);
  const tasks = useOrderTasks(orderNumber);

  const row = metrics.data;
  const receiptList = useMemo(() => receipts.data ?? [], [receipts.data]);
  const taskList = useMemo(() => tasks.data ?? [], [tasks.data]);

  const lastStorageAt = useMemo(() => {
    let max: Date | null = null;
    for (const r of receiptList) {
      const d = parseLocalDateTime(r.storage_date, r.storage_time);
      if (d && (!max || d > max)) max = d;
    }
    return max;
  }, [receiptList]);

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" /> Linha do tempo
          </p>
          <div className="flex flex-col">
            {steps.map((s) => (
              <TimelineStep key={s.label} {...s} />
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Boxes className="h-4 w-4 text-primary" /> Pallets / UC da ordem
            <Badge variant="secondary">{taskList.length}</Badge>
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UC</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead>Processo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Puxada</TableHead>
                  <TableHead>Armazenagem</TableHead>
                  <TableHead className="text-right">Espera</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskList.map((t) => {
                  const pullAt = taskPullAt(t);
                  const storageAt = taskStorageAt(t);
                  const wait = minutesBetween(pullAt, storageAt);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.source_uc ?? "—"}</TableCell>
                      <TableCell>{t.document ?? "—"}</TableCell>
                      <TableCell>{t.material_code ?? "—"}</TableCell>
                      <TableCell>{t.lot ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtQty(t.quantity)}</TableCell>
                      <TableCell>
                        <Badge variant={t.process_type === "1020" ? "info" : "secondary"}>
                          {t.process_type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <TaskStatusBadge status={t.task_status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3" />
                          {t.author ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtDateTime(pullAt?.toISOString())}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3" />
                          {t.confirmed_by ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtDateTime(storageAt?.toISOString())}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {wait !== null && wait >= 0 ? fmtDurationMinutes(wait) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {taskList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Nenhuma tarefa MON vinculada a esta ordem.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4 text-primary" /> Entradas físicas (Recebimento)
          <Badge variant="secondary">{receiptList.length}</Badge>
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead>UM</TableHead>
                <TableHead>EM (data)</TableHead>
                <TableHead>EM (hora)</TableHead>
                <TableHead>Depósito (data)</TableHead>
                <TableHead>Depósito (hora)</TableHead>
                <TableHead>Válido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receiptList.map((r) => (
                <TableRow key={r.id}>
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
                      <Badge variant="danger">Não</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {receiptList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    Nenhum recebimento vinculado a esta ordem.
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
