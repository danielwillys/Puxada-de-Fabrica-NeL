// CONVERGE.AI - process-import backend function
// Validates, deduplicates and upserts COOISPI / Recebimento / MON imports.
// Writes import history + audit logs, then refreshes order metrics and
// warehouse-task shift classification on the database side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FILE_TYPES = ["cooispi", "recebimento", "mon"] as const;
type FileType = (typeof FILE_TYPES)[number];

interface ImportRow {
  [key: string]: unknown;
}

const TABLES: Record<FileType, string> = {
  cooispi: "production_orders",
  recebimento: "production_receipts",
  mon: "warehouse_tasks",
};

// The natural key used for dedup/upsert differs per table:
// production_orders is keyed by order_number; the others carry a dedup_key.
const KEY_COLUMN: Record<FileType, string> = {
  cooispi: "order_number",
  recebimento: "dedup_key",
  mon: "dedup_key",
};

// ---------- parsing helpers ----------
const normText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  let s = String(v).trim();
  if (s.includes(",")) {
    // comma is the decimal separator -> dots are thousands separators
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Excel serial (1899-12-30 epoch) -> yyyy-mm-dd, using UTC. */
const excelSerialDate = (serial: number): string => {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/** Excel serial fraction of a day -> HH:MM:SS. */
const excelSerialTime = (serial: number): string => {
  const frac = ((serial % 1) + 1) % 1;
  let secs = Math.round(frac * 86400);
  if (secs >= 86400) secs = 0;
  return `${pad2(Math.floor(secs / 3600))}:${pad2(Math.floor((secs % 3600) / 60))}:${pad2(secs % 60)}`;
};

const parseDate = (v: unknown): string | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  // Raw Excel date cell (date serial >= 1) arriving as a number.
  if (typeof v === "number" && Number.isFinite(v) && v >= 1) return excelSerialDate(v);
  const s = String(v).trim();
  // dd.mm.yyyy, dd/mm/yyyy or US mm/dd/yyyy, optionally followed by a time part
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:\s.*)?$/);
  if (m) {
    let day = Number(m[1]);
    let mon = Number(m[2]);
    if (day <= 12 && mon > 12) {
      // mm/dd/yyyy (US): first token is the month, second is the day
      const tmp = day;
      day = mon;
      mon = tmp;
    }
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (Number(yyyy) > 30 ? "19" : "20") + yyyy;
    return `${yyyy}-${pad2(mon)}-${pad2(day)}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const parseTime = (v: unknown): string | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  // Raw Excel time cell (fraction of a day) arriving as a number.
  if (typeof v === "number" && Number.isFinite(v)) return excelSerialTime(v);
  const s = String(v).trim();
  // A numeric string without a colon is an Excel serial time as well.
  if (/^\d*\.\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return excelSerialTime(n);
  }
  // Accepts 24h ("19:07:24") and 12h with AM/PM ("7:07:24 PM")
  const m = s.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*([AaPp][Mm])?/);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = m[2];
  const ss = m[3] ?? "00";
  const meridiem = m[4]?.toUpperCase();
  if (meridiem === "PM" && hh < 12) hh += 12;
  if (meridiem === "AM" && hh === 12) hh = 0;
  if (hh > 23 || Number(mm) > 59 || Number(ss) > 59) return null;
  return `${pad2(hh)}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")}`;
};

const parseTs = (v: unknown): string | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const s = String(v).trim();
  // dd.mm.yyyy[ hh:mm[:ss]] and dd/mm/yyyy variants
  const m = s.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (m) {
    let day = Number(m[1]);
    let mon = Number(m[2]);
    if (day <= 12 && mon > 12) {
      // mm/dd/yyyy (US)
      const tmp = day;
      day = mon;
      mon = tmp;
    }
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (Number(yyyy) > 30 ? "19" : "20") + yyyy;
    const t = m[4]
      ? `${m[4].padStart(2, "0")}:${m[5].padStart(2, "0")}:${(m[6] ?? "00").padStart(2, "0")}`
      : "00:00:00";
    const d = new Date(`${yyyy}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}T${t}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ---------- row validators (return array of error strings) ----------
const validateCooispi = (r: ImportRow): string[] => {
  const errors: string[] = [];
  if (!normText(r.order_number)) errors.push("Ordem é obrigatória");
  if (!normText(r.material_code)) errors.push("Material é obrigatório");
  if (toNumber(r.planned_quantity) === null) errors.push("Quantidade da ordem inválida");
  if (toNumber(r.confirmed_quantity) === null) errors.push("Quantidade boa confirmada inválida");
  if (toNumber(r.sap_supplied_quantity) === null) errors.push("Qtd. fornecida inválida");
  const p = toNumber(r.planned_quantity) ?? 0;
  const c = toNumber(r.confirmed_quantity) ?? 0;
  const s = toNumber(r.sap_supplied_quantity) ?? 0;
  if (p < 0) errors.push("Quantidade da ordem negativa");
  if (c < 0) errors.push("Quantidade boa confirmada negativa");
  if (s < 0) errors.push("Qtd. fornecida negativa");
  for (const f of ["actual_start", "actual_end", "planned_start", "created_date"]) {
    const v = r[f];
    if (v !== null && v !== undefined && String(v).trim() !== "" && !parseTs(v)) {
      errors.push(`Data inválida em ${f}`);
    }
  }
  return errors;
};

const validateRecebimento = (r: ImportRow): string[] => {
  const errors: string[] = [];
  if (!normText(r.document_number)) errors.push("Documento é obrigatório");
  if (!normText(r.production_order)) errors.push("Ordem de produção é obrigatória");
  if (!normText(r.material_code)) errors.push("Produto é obrigatório");
  const q = toNumber(r.quantity);
  if (q === null) errors.push("Quantidade inválida");
  else if (q <= 0) errors.push("Quantidade deve ser maior que zero");
  for (const f of ["goods_receipt_date", "storage_date"]) {
    const v = r[f];
    if (v !== null && v !== undefined && String(v).trim() !== "" && !parseDate(v)) {
      errors.push(`Data inválida em ${f}`);
    }
  }
  return errors;
};

const validateMon = (r: ImportRow): string[] => {
  const errors: string[] = [];
  if (!normText(r.warehouse_task)) errors.push("Tarefa de depósito é obrigatória");
  const q = toNumber(r.quantity);
  if (q !== null && q < 0) errors.push("Quantidade negativa");
  if (r.process_type !== "1020" && r.process_type !== "1012") {
    errors.push("Tipo proc. depósito deve ser 1020 ou 1012");
  }
  for (const f of ["goods_receipt_date", "creation_date", "confirmation_date"]) {
    const v = r[f];
    if (v !== null && v !== undefined && String(v).trim() !== "" && !parseDate(v)) {
      errors.push(`Data inválida em ${f}`);
    }
  }
  for (const f of ["creation_time", "confirmation_time"]) {
    const v = r[f];
    if (v !== null && v !== undefined && String(v).trim() !== "" && !parseTime(v)) {
      errors.push(`Hora inválida em ${f}`);
    }
  }
  return errors;
};

const VALIDATORS: Record<FileType, (r: ImportRow) => string[]> = {
  cooispi: validateCooispi,
  recebimento: validateRecebimento,
  mon: validateMon,
};

// ---------- payload builders ----------
const buildCooispi = (r: ImportRow) => ({
  order_number: normText(r.order_number) ?? "",
  material_code: normText(r.material_code) ?? "",
  material_description: normText(r.material_description),
  planned_quantity: toNumber(r.planned_quantity) ?? 0,
  confirmed_quantity: toNumber(r.confirmed_quantity) ?? 0,
  sap_supplied_quantity: toNumber(r.sap_supplied_quantity) ?? 0,
  unit: normText(r.unit),
  lot: normText(r.lot),
  actual_start: parseTs(r.actual_start),
  actual_end: parseTs(r.actual_end),
  planned_start: parseTs(r.planned_start),
  created_date: parseTs(r.created_date),
});

const buildRecebimento = (r: ImportRow) => {
  const doc = normText(r.document_number) ?? "";
  const ord = normText(r.production_order) ?? "";
  const mat = normText(r.material_code) ?? "";
  const lot = normText(r.lot) ?? "";
  const qty = toNumber(r.quantity) ?? 0;
  // The date is intentionally excluded from the key: a corrected date must
  // update the same receipt instead of creating a duplicate row.
  const dedupKey = [doc, ord, mat, lot, qty].join("|");
  return {
    document_number: doc,
    production_order: ord,
    material_code: mat,
    material_description: normText(r.material_description),
    quantity: qty,
    unit: normText(r.unit),
    lot: normText(r.lot),
    goods_receipt_status: normText(r.goods_receipt_status),
    warehouse_entry_status: normText(r.warehouse_entry_status),
    goods_receipt_date: parseDate(r.goods_receipt_date),
    goods_receipt_time: parseTime(r.goods_receipt_time),
    process_type: normText(r.process_type),
    storage_date: parseDate(r.storage_date),
    storage_time: parseTime(r.storage_time),
    is_valid: true,
    dedup_key: dedupKey,
  };
};

const buildMon = (r: ImportRow) => {
  const task = normText(r.warehouse_task) ?? "";
  const qty = toNumber(r.quantity) ?? 0;
  return {
    warehouse_task: task,
    document: normText(r.document),
    production_order: normText(r.production_order),
    source_uc: normText(r.source_uc),
    material_code: normText(r.material_code),
    material_description: normText(r.material_description),
    lot: normText(r.lot),
    quantity: qty,
    unit: normText(r.unit),
    process_type: normText(r.process_type) ?? "",
    task_status: normText(r.task_status),
    goods_receipt_date: parseDate(r.goods_receipt_date),
    author: normText(r.author),
    creation_date: parseDate(r.creation_date),
    creation_time: parseTime(r.creation_time),
    confirmed_by: normText(r.confirmed_by),
    confirmation_date: parseDate(r.confirmation_date),
    confirmation_time: parseTime(r.confirmation_time),
    dedup_key: task,
  };
};

const BUILDERS: Record<FileType, (r: ImportRow) => Record<string, unknown>> = {
  cooispi: buildCooispi,
  recebimento: buildRecebimento,
  mon: buildMon,
};

const MAX_ERRORS = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return json(corsHeaders, { ok: false, error: "Não autenticado" }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json(corsHeaders, { ok: false, error: "Sessão inválida" }, 401);
    }
    const user = userData.user;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return json(corsHeaders, { ok: false, error: "Apenas administradores podem importar" }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json(corsHeaders, { ok: false, error: "Corpo inválido" }, 400);
    const fileType = body.file_type as FileType;
    const fileName = typeof body.file_name === "string" ? body.file_name : "importacao.xlsx";
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];

    if (!FILE_TYPES.includes(fileType)) {
      return json(corsHeaders, { ok: false, error: "Tipo de arquivo inválido" }, 400);
    }
    if (rows.length === 0) {
      return json(corsHeaders, { ok: false, error: "Nenhuma linha para importar" }, 400);
    }

    // Create import history row
    const { data: imp, error: impErr } = await supabase
      .from("imports")
      .insert({
        file_name: fileName,
        file_type: fileType,
        imported_by: user.id,
        total_records: rows.length,
        status: "processing",
      })
      .select("id")
      .single();
    if (impErr || !imp) {
      return json(corsHeaders, { ok: false, error: "Falha ao registrar importação" }, 500);
    }
    const importId = imp.id;

    const table = TABLES[fileType];
    const validate = VALIDATORS[fileType];
    const build = BUILDERS[fileType];

    const errors: { row: number; errors: string[] }[] = [];
    const validRows: Record<string, unknown>[] = [];
    const seenKeys = new Set<string>();

    rows.forEach((r, idx) => {
      const rowErrors = validate(r);
      if (rowErrors.length > 0) {
        if (errors.length < MAX_ERRORS) errors.push({ row: idx + 2, errors: rowErrors });
        return;
      }
      const payload = build(r);
      const key = String(payload.dedup_key ?? payload.order_number ?? "");
      if (key) {
        if (seenKeys.has(key)) {
          if (errors.length < MAX_ERRORS) errors.push({ row: idx + 2, errors: ["Registro duplicado no arquivo"] });
          return;
        }
        seenKeys.add(key);
      }
      validRows.push(payload);
    });

    let inserted = 0;
    let updated = 0;

    if (validRows.length > 0) {
      const keyCol = KEY_COLUMN[fileType];
      const keyOf = (r: Record<string, unknown>) =>
        String(r[keyCol] ?? r.dedup_key ?? r.order_number ?? "");

      // Which rows already exist? Small chunks keep the request URL short; a
      // long `.in()` list can exceed URL limits and fail, which would make us
      // try to insert rows that already exist.
      const existingKeys = new Set<string>();
      let existenceUnknown = false;
      for (const keyChunk of chunk(validRows.map(keyOf), 100)) {
        const { data: existing, error: lookupErr } = await supabase
          .from(table)
          .select(keyCol)
          .in(keyCol, keyChunk);
        if (lookupErr) {
          existenceUnknown = true;
          break;
        }
        (existing ?? []).forEach((e) =>
          existingKeys.add(String((e as Record<string, unknown>)[keyCol])),
        );
      }

      const toInsert = existenceUnknown
        ? []
        : validRows.filter((r) => !existingKeys.has(keyOf(r)));
      // Recebimentos já existentes NÃO são atualizados: preserva estornos
      // (is_valid = false) e qualquer edição feita no sistema. A reimportação
      // apenas insere documentos ainda não registrados. MON e COOISPI seguem
      // com upsert (atualização de status/datas).
      const toUpdate =
        fileType === "recebimento"
          ? []
          : existenceUnknown
            ? validRows
            : validRows.filter((r) => existingKeys.has(keyOf(r)));

      for (const batch of chunk(toInsert, 500)) {
        const { error: insErr } = await supabase.from(table).insert(batch);
        if (!insErr) {
          inserted += batch.length;
          continue;
        }
        // A row that already exists (missed lookup or concurrent import) must be
        // updated, never abort the whole import.
        if (/duplicate key/i.test(insErr.message)) {
          const { error: retryErr } = await supabase
            .from(table)
            .upsert(batch, { onConflict: keyCol });
          if (retryErr) throw new Error(`Falha ao atualizar: ${retryErr.message}`);
          updated += batch.length;
          continue;
        }
        throw new Error(`Falha ao inserir: ${insErr.message}`);
      }

      for (const batch of chunk(toUpdate, 500)) {
        const { error: updErr } = await supabase
          .from(table)
          .upsert(batch, { onConflict: keyCol });
        if (updErr) throw new Error(`Falha ao atualizar: ${updErr.message}`);
        updated += batch.length;
      }
    }

    // Refresh order status/required quantities (best effort)
    if (validRows.length > 0) {
      try {
        await supabase.rpc("refresh_order_metrics");
      } catch {
        // refresh is best-effort; the import result stays valid
      }
      if (fileType === "mon") {
        try {
          await supabase.rpc("classify_warehouse_task_shifts");
        } catch {
          // classification can be reprocessed later by an administrator
        }
      }
    }

    const rejected = rows.length - inserted - updated;

    const { error: updImpErr } = await supabase
      .from("imports")
      .update({
        status: "completed",
        inserted_records: inserted,
        updated_records: updated,
        rejected_records: rejected,
        error_log: errors,
      })
      .eq("id", importId);
    if (updImpErr) throw new Error(`Falha ao finalizar importação: ${updImpErr.message}`);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "import",
      entity: "imports",
      entity_id: String(importId),
      new_value: {
        file_name: fileName,
        file_type: fileType,
        total: rows.length,
        inserted,
        updated,
        rejected,
      },
    });

    return json(corsHeaders, {
      ok: true,
      import_id: importId,
      total: rows.length,
      inserted,
      updated,
      rejected,
      errors,
    });
  } catch (err) {
    console.error("process-import failed:", err);
    return json(corsHeaders, { ok: false, error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});

function json(headers: Record<string, string>, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
