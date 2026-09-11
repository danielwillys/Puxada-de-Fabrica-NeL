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

/**
 * Header names are matched loosely (accents, case, punctuation and spacing are
 * ignored) so small variations in the SAP export never drop a column silently.
 */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Additional accepted spellings per field (already normalized). */
const FIELD_ALIASES: Record<string, string[]> = {
  storage_date: [
    "data real de entrada em deposito",
    "data real entrada em deposito",
    "data real da entrada em deposito",
    "data de entrada em deposito",
    "data da entrada em deposito",
  ],
  storage_time: [
    "hora real entrada em deposito",
    "hora real de entrada em deposito",
    "hora real da entrada em deposito",
    "hora de entrada em deposito",
    "hora da entrada em deposito",
    "hora real entrada deposito",
  ],
  goods_receipt_date: [
    "data real da entrada de mercadorias",
    "data real de entrada de mercadorias",
    "data da entrada de mercadorias",
  ],
  goods_receipt_time: [
    "hora da em real",
    "hora real da em",
    "hora real da entrada de mercadorias",
    "hora da entrada de mercadorias",
  ],
  creation_date: ["data de criacao", "data criacao"],
  creation_time: ["hora da criacao", "hora criacao", "hora de criacao"],
  confirmation_date: [
    "data da confirmacao",
    "data de confirmacao",
    "data confirmacao",
  ],
  confirmation_time: [
    "hora da confirmacao",
    "hora de confirmacao",
    "hora confirmacao",
  ],
};

/** normalized header -> field for an import type (column map + aliases). */
export function buildHeaderLookup(type: ImportType): Map<string, string> {
  const lookup = new Map<string, string>();
  const fields = new Set<string>();
  for (const [header, field] of Object.entries(COLUMN_MAPS[type])) {
    lookup.set(normalizeHeader(header), field);
    fields.add(field);
  }
  for (const field of fields) {
    for (const alias of FIELD_ALIASES[field] ?? []) {
      if (!lookup.has(alias)) lookup.set(alias, field);
    }
  }
  return lookup;
}

/** Required headers that the file does not provide (loose matching). */
export function missingRequiredHeaders(
  headers: string[],
  type: ImportType,
): string[] {
  const lookup = buildHeaderLookup(type);
  return REQUIRED_HEADERS[type].filter((h) => !lookup.has(normalizeHeader(h)));
}

/** File columns that the import type does not recognize. */
export function unmappedHeaders(headers: string[], type: ImportType): string[] {
  const lookup = buildHeaderLookup(type);
  return headers.filter((h) => !lookup.has(normalizeHeader(h)));
}

export interface ImportError {
  row: number;
  errors: string[];
}

/** Fields that hold a calendar date, a time of day, or a full timestamp. */
const DATE_FIELDS = new Set([
  "goods_receipt_date",
  "storage_date",
  "creation_date",
  "confirmation_date",
]);
const TIME_FIELDS = new Set([
  "goods_receipt_time",
  "creation_time",
  "confirmation_time",
]);
const TS_FIELDS = new Set([
  "actual_start",
  "actual_end",
  "planned_start",
  "created_date",
]);

/**
 * Convert an Excel serial value (days since 1899-12-30) into its date, time and
 * ISO parts, using UTC so the result never depends on the browser timezone or on
 * the cell's display format.
 */
function excelSerialParts(serial: number) {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    iso: d.toISOString(),
  };
}

/** Convert a raw cell value for a date/time field into a normalized value. */
function convertField(field: string, value: unknown): unknown {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  if (DATE_FIELDS.has(field)) return excelSerialParts(value).date;
  if (TIME_FIELDS.has(field)) return excelSerialParts(value).time;
  if (TS_FIELDS.has(field)) {
    // Full datetime cells are serial > 1; a bare fraction is a time of day.
    return value >= 1 ? excelSerialParts(value).iso : excelSerialParts(value).time;
  }
  return value;
}

/** Normalize parsed Excel rows into backend-ready payloads using a column map. */
export function normalizeRows(
  rows: Record<string, unknown>[],
  type: ImportType,
): Record<string, unknown>[] {
  const lookup = buildHeaderLookup(type);
  return rows.map((raw) => {
    const out: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(raw)) {
      const field = lookup.get(normalizeHeader(header));
      if (!field) continue;
      out[field] = convertField(field, value);
    }
    return out;
  });
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
