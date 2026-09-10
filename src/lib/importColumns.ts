import type { ProductionReceipt, WarehouseTask } from "./types";

export type ImportType = "cooispi" | "recebimento" | "mon";

/** SAP pt-BR header → normalized field mapping per import type. */
export const COLUMN_MAPS: Record<ImportType, Record<string, string>> = {
  cooispi: {
    Ordem: "order_number",
    Material: "material_code",
    "Texto breve material": "material_description",
    "Quantidade da ordem (GMEIN)": "planned_quantity",
    "Quantidade boa confirmada (GMEIN)": "confirmed_quantity",
    "Qtd.fornecida (GMEIN)": "sap_supplied_quantity",
    "Unidade de medida (=GMEIN)": "unit",
    Lote: "lot",
    "Data início real": "actual_start",
    "Data real do fim": "actual_end",
    "Data-base iníc.": "planned_start",
    "Data de entrada": "created_date",
  },
  recebimento: {
    Documento: "document_number",
    "Ordem de produção": "production_order",
    Produto: "material_code",
    "Descrição breve do produto": "material_description",
    Quantidade: "quantity",
    Lote: "lot",
    "Status da entrada de mercadorias": "goods_receipt_status",
    "Status da entrada em depósito": "warehouse_entry_status",
    "Data real da entrada de mercadorias": "goods_receipt_date",
    "Hora da EM (real)": "goods_receipt_time",
    "Tipo proc.depósito": "process_type",
    "Data real de entrada em depósito": "storage_date",
    "Hora real entrada em depósito": "storage_time",
    "Unidade de medida": "unit",
  },
  mon: {
    "Tarefa de depósito": "warehouse_task",
    Documento: "document",
    "Ordem de produção": "production_order",
    "UC de origem": "source_uc",
    Produto: "material_code",
    "Descrição breve do produto": "material_description",
    Lote: "lot",
    "Qtd.prev.origem UMB": "quantity",
    "UM básica": "unit",
    "Tipo proc.depósito": "process_type",
    "Status da tarefa de depósito": "task_status",
    "Data da entrada de mercadorias": "goods_receipt_date",
    Autor: "author",
    "Data de criação": "creation_date",
    "Hora da criação": "creation_time",
    "Confirmado por": "confirmed_by",
    "Data da confirmação": "confirmation_date",
    "Hora da confirmação": "confirmation_time",
  },
};

/** Required headers: import is blocked when any of these is missing. */
export const REQUIRED_HEADERS: Record<ImportType, string[]> = {
  cooispi: ["Ordem", "Material", "Quantidade da ordem (GMEIN)"],
  recebimento: ["Documento", "Ordem de produção", "Produto", "Quantidade"],
  mon: ["Tarefa de depósito", "Tipo proc.depósito"],
};

export interface ImportError {
  row: number;
  errors: string[];
}

export interface ImportResult {
  ok: boolean;
  import_id?: number;
  total?: number;
  inserted?: number;
  updated?: number;
  rejected?: number;
  errors?: ImportError[];
  error?: string;
}

/** Normalize parsed Excel rows into backend-ready payloads using a column map. */
export function normalizeRows(
  rows: Record<string, unknown>[],
  type: ImportType,
): Record<string, unknown>[] {
  const map = COLUMN_MAPS[type];
  return rows.map((raw) => {
    const out: Record<string, unknown> = {};
    for (const [header, field] of Object.entries(map)) {
      out[field] = raw[header] ?? "";
    }
    return out;
  });
}

export interface ImportPayload {
  file_type: ImportType;
  file_name: string;
  rows: Record<string, unknown>[];
}

export function buildImportPayload(
  file: File,
  type: ImportType,
  rows: Record<string, unknown>[],
): ImportPayload {
  return { file_type: type, file_name: file.name, rows: normalizeRows(rows, type) };
}

/** Display helper columns for receipts on the order detail. */
export const RECEIPT_COLUMNS = [
  "document_number",
  "production_order",
  "material_code",
  "material_description",
  "quantity",
  "unit",
  "lot",
  "goods_receipt_status",
  "warehouse_entry_status",
  "goods_receipt_date",
  "goods_receipt_time",
  "storage_date",
  "storage_time",
] as const satisfies readonly (keyof ProductionReceipt)[];

export const TASK_COLUMNS = [
  "warehouse_task",
  "source_uc",
  "material_code",
  "lot",
  "quantity",
  "process_type",
  "task_status",
  "author",
  "confirmed_by",
] as const satisfies readonly (keyof WarehouseTask)[];
