import type { ProductionReceipt, WarehouseTask } from "./types";
import { parseLocalDateTime } from "./format";

/**
 * Linha visível da tabela "Pallets / UC da ordem".
 *
 * Regras de exibição:
 * - Somente UCs cuja armazenagem foi confirmada aparecem (existe tarefa 1012
 *   confirmada para o mesmo palete) OU que foram estornadas pelo painel.
 * - Tarefas estornadas no relatório (task_status = 'A') nunca aparecem.
 * - Estorno feito pelo painel (Estornar recebimento) fica vinculado à UC
 *   (colunas reversal_reason / reversed_at) e é exibido como "Estornado".
 */
export interface UcViewRow {
  id: number;
  productionOrder: string | null;
  uc: string | null;
  document: string | null;
  receiptDocument: string | null;
  material: string | null;
  description: string | null;
  lot: string | null;
  pdDestino: string | null;
  quantity: number;
  unit: string | null;
  status: string | null;
  panelReversed: boolean;
  reversalReason: string | null;
  reversedAt: string | null;
  pullAuthor: string | null;
  pullAt: string | null;
  storageBy: string | null;
  storageAt: string | null;
  waitMinutes: number | null;
}

function palletKey(
  order: string | null,
  material: string | null,
  lot: string | null,
  quantity: number,
): string {
  return `${order ?? ""}\u0000${material ?? ""}\u0000${lot ?? ""}\u0000${quantity}`;
}

/** Vincula o número do recebimento à UC pela data/hora de armazenagem (=confirmação). */
function buildReceiptLookup(receipts: ProductionReceipt[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of receipts) {
    if (!r.storage_date || !r.storage_time) continue;
    const key = `${r.production_order ?? ""}\u0000${r.material_code ?? ""}\u0000${r.lot ?? ""}\u0000${r.storage_date}\u0000${r.storage_time}`;
    if (!map.has(key)) map.set(key, r.document_number);
  }
  return map;
}

export function buildUcView(
  tasks: WarehouseTask[],
  receipts: ProductionReceipt[] = [],
): UcViewRow[] {
  const confirmedStorage = new Set<string>();
  for (const t of tasks) {
    if (t.process_type !== "1012") continue;
    const confirmed = t.task_status === "C" || t.confirmation_date != null;
    if (confirmed) {
      confirmedStorage.add(
        palletKey(t.production_order, t.material_code, t.lot, t.quantity),
      );
    }
  }

  const receiptByStorage = buildReceiptLookup(receipts);

  const rows: UcViewRow[] = [];
  for (const t of tasks) {
    if (t.process_type !== "1020") continue;
    // Estornada no relatório (MON) → não aparece.
    if (t.task_status === "A") continue;
    const panelReversed = t.reversed_at != null;
    const key = palletKey(t.production_order, t.material_code, t.lot, t.quantity);
    // Somente UCs com armazenagem confirmada (ou estornadas pelo painel).
    if (!confirmedStorage.has(key) && !panelReversed) continue;

    const pullAt = parseLocalDateTime(t.creation_date, t.creation_time);
    const storageAt = parseLocalDateTime(t.confirmation_date, t.confirmation_time);
    const wait =
      pullAt && storageAt ? (storageAt.getTime() - pullAt.getTime()) / 60000 : null;

    const receiptDoc = t.confirmation_date && t.confirmation_time
      ? (receiptByStorage.get(
          `${t.production_order ?? ""}\u0000${t.material_code ?? ""}\u0000${t.lot ?? ""}\u0000${t.confirmation_date}\u0000${t.confirmation_time}`,
        ) ?? null)
      : null;

    rows.push({
      id: t.id,
      productionOrder: t.production_order,
      uc: t.source_uc,
      document: t.document,
      receiptDocument: receiptDoc,
      material: t.material_code,
      description: t.material_description,
      lot: t.lot,
      pdDestino: t.pd_destino,
      quantity: t.quantity,
      unit: t.unit,
      status: t.task_status,
      panelReversed,
      reversalReason: t.reversal_reason,
      reversedAt: t.reversed_at,
      pullAuthor: t.author,
      pullAt: pullAt ? pullAt.toISOString() : null,
      storageBy: t.confirmed_by,
      storageAt: storageAt ? storageAt.toISOString() : null,
      waitMinutes: wait !== null && wait >= 0 ? wait : null,
    });
  }
  return rows;
}
