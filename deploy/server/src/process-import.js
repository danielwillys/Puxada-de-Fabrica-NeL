import { Router } from "express";
import { supabase } from "./client.js";

/**
 * Importação de dados — porta fiel da função de backend process-import.
 * Endpoint: POST /process-import
 * Autenticação: Bearer JWT (tela) OU x-api-key (robô SAP, com permissão "import").
 * Aceita campos já normalizados (tela) ou cabeçalhos originais do SAP
 * (robô, com raw_headers: true).
 */
export const processImportRouter = Router();

// ---------------------------------------------------------------- utilitários

const normText = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const toNumber = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  let s = String(v).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const pad2 = (n) => String(n).padStart(2, "0");

const excelSerialDate = (serial) => {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

const excelSerialTime = (serial) => {
  const frac = ((serial % 1) + 1) % 1;
  let secs = Math.round(frac * 86400);
  if (secs >= 86400) secs = 0;
  return `${pad2(Math.floor(secs / 3600))}:${pad2(Math.floor((secs % 3600) / 60))}:${pad2(secs % 60)}`;
};

const parseDate = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 1) return excelSerialDate(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:\s.*)?$/);
  if (m) {
    let day = Number(m[1]);
    let mon = Number(m[2]);
    if (day <= 12 && mon > 12) {
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

const parseTime = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return excelSerialTime(v);
  const s = String(v).trim();
  if (/^\d*\.\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return excelSerialTime(n);
  }
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

const parseTs = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    let day = Number(m[1]);
    let mon = Number(m[2]);
    if (day <= 12 && mon > 12) {
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

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const sha256Hex = async (value) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// ------------------------------------------------------------------- validators

const validateCooispi = (r) => {
  const errors = [];
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

const validateRecebimento = (r) => {
  const errors = [];
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

const validateMon = (r) => {
  const errors = [];
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

const VALIDATORS = { cooispi: validateCooispi, recebimento: validateRecebimento, mon: validateMon };

// -------------------------------------------------------------------- builders

const buildCooispi = (r) => ({
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

const buildRecebimento = (r) => {
  const doc = normText(r.document_number) ?? "";
  const ord = normText(r.production_order) ?? "";
  const mat = normText(r.material_code) ?? "";
  const lot = normText(r.lot) ?? "";
  const qty = toNumber(r.quantity) ?? 0;
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

const buildMon = (r) => {
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
    pd_destino: normText(r.pd_destino),
    dedup_key: task,
  };
};

const BUILDERS = { cooispi: buildCooispi, recebimento: buildRecebimento, mon: buildMon };

// ------------------------------------------------- cabeçalhos do SAP (robô)

const COLUMN_MAPS = {
  cooispi: {
    "Ordem": "order_number",
    "Material": "material_code",
    "Texto breve material": "material_description",
    "Quantidade da ordem (GMEIN)": "planned_quantity",
    "Quantidade boa confirmada (GMEIN)": "confirmed_quantity",
    "Qtd.fornecida (GMEIN)": "sap_supplied_quantity",
    "Unidade de medida (=GMEIN)": "unit",
    "Lote": "lot",
    "Data início real": "actual_start",
    "Data real do fim": "actual_end",
    "Data-base iníc.": "planned_start",
    "Data de entrada": "created_date",
  },
  recebimento: {
    "Documento": "document_number",
    "Ordem de produção": "production_order",
    "Produto": "material_code",
    "Descrição breve do produto": "material_description",
    "Quantidade": "quantity",
    "Lote": "lot",
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
    "Documento": "document",
    "Ordem de produção": "production_order",
    "UC de origem": "source_uc",
    "Produto": "material_code",
    "Descrição breve do produto": "material_description",
    "Lote": "lot",
    "Qtd.prev.origem UMB": "quantity",
    "UM básica": "unit",
    "Tipo proc.depósito": "process_type",
    "Status da tarefa de depósito": "task_status",
    "Data da entrada de mercadorias": "goods_receipt_date",
    "Autor": "author",
    "Data de criação": "creation_date",
    "Hora da criação": "creation_time",
    "Confirmado por": "confirmed_by",
    "Data da confirmação": "confirmation_date",
    "Hora da confirmação": "confirmation_time",
    "PD destino": "pd_destino",
  },
};

const FIELD_ALIASES = {
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
  confirmation_date: ["data da confirmacao", "data de confirmacao", "data confirmacao"],
  confirmation_time: ["hora da confirmacao", "hora de confirmacao", "hora confirmacao"],
};

const normalizeHeader = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function buildHeaderLookup(type) {
  const lookup = new Map();
  const fields = new Set();
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

function normalizeRawRows(rows, type) {
  const lookup = buildHeaderLookup(type);
  return rows.map((raw) => {
    const out = {};
    for (const [header, value] of Object.entries(raw)) {
      const field = lookup.get(normalizeHeader(header));
      if (!field) continue;
      out[field] = value;
    }
    return out;
  });
}

// -------------------------------------------------------------------- rota

const FILE_TYPES = ["cooispi", "recebimento", "mon"];
const TABLES = { cooispi: "production_orders", recebimento: "production_receipts", mon: "warehouse_tasks" };
const KEY_COLUMN = { cooispi: "order_number", recebimento: "dedup_key", mon: "dedup_key" };
const MAX_ERRORS = 1000;

processImportRouter.post("/", async (req, res) => {
  try {
    // Autenticação: 1) x-api-key (robô SAP) OU 2) Bearer JWT (tela).
    const apiKey = String(req.headers["x-api-key"] ?? "").trim();
    let userId = null;
    let tokenId = null;
    let tokenName = null;

    if (apiKey) {
      const hash = await sha256Hex(apiKey);
      const { data: tokenRow } = await supabase
        .from("ingestion_tokens")
        .select("id,name,active")
        .eq("token_hash", hash)
        .maybeSingle();
      if (!tokenRow || !tokenRow.active) {
        return res.status(401).json({ ok: false, error: "Chave de integração inválida ou inativa." });
      }
      tokenId = tokenRow.id;
      tokenName = tokenRow.name;
    } else {
      const auth = req.headers.authorization ?? "";
      const jwt = auth.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) return res.status(401).json({ ok: false, error: "Não autenticado" });

      const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
      if (userError || !userData?.user) {
        return res.status(401).json({ ok: false, error: "Sessão inválida" });
      }
      const user = userData.user;
      userId = user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, role_id, user_roles(permissions)")
        .eq("id", user.id)
        .maybeSingle();
      const profileRow = profile;
      const perms = Array.isArray(profileRow?.user_roles?.permissions)
        ? profileRow.user_roles.permissions.filter((p) => typeof p === "string")
        : [];
      if (profileRow?.role !== "admin" && !perms.includes("import")) {
        return res.status(403).json({ ok: false, error: "Seu perfil não tem permissão para importar dados." });
      }
    }

    const body = req.body ?? {};
    const fileType = body.file_type;
    const fileName = typeof body.file_name === "string" ? body.file_name : "importacao.xlsx";
    let rows = Array.isArray(body.rows) ? body.rows : [];

    if (!FILE_TYPES.includes(fileType)) {
      return res.status(400).json({ ok: false, error: "Tipo de arquivo inválido" });
    }
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: "Nenhuma linha para importar" });
    }
    if (body.raw_headers === true) {
      rows = normalizeRawRows(rows, fileType);
    }

    // Histórico da importação
    const { data: imp, error: impErr } = await supabase
      .from("imports")
      .insert({
        file_name: fileName,
        file_type: fileType,
        imported_by: userId,
        total_records: rows.length,
        status: "processing",
        source: tokenId !== null ? "auto" : "manual",
      })
      .select("id")
      .single();
    if (impErr || !imp) {
      return res.status(500).json({ ok: false, error: "Falha ao registrar importação" });
    }
    const importId = imp.id;

    const table = TABLES[fileType];
    const validate = VALIDATORS[fileType];
    const build = BUILDERS[fileType];

    const errors = [];
    const validRows = [];
    const seenKeys = new Set();

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
      const keyOf = (r) => String(r[keyCol] ?? r.dedup_key ?? r.order_number ?? "");

      const existingKeys = new Set();
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
        (existing ?? []).forEach((e) => existingKeys.add(String(e[keyCol])));
      }

      const toInsert = existenceUnknown ? [] : validRows.filter((r) => !existingKeys.has(keyOf(r)));
      // Recebimentos existentes NÃO são atualizados (preserva estornos).
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
        if (/duplicate key/i.test(insErr.message)) {
          const { error: retryErr } = await supabase.from(table).upsert(batch, { onConflict: keyCol });
          if (retryErr) throw new Error(`Falha ao atualizar: ${retryErr.message}`);
          updated += batch.length;
          continue;
        }
        throw new Error(`Falha ao inserir: ${insErr.message}`);
      }

      for (const batch of chunk(toUpdate, 500)) {
        const { error: updErr } = await supabase.from(table).upsert(batch, { onConflict: keyCol });
        if (updErr) throw new Error(`Falha ao atualizar: ${updErr.message}`);
        updated += batch.length;
      }
    }

    if (validRows.length > 0) {
      try {
        await supabase.rpc("refresh_order_metrics");
      } catch {
        // best-effort
      }
      if (fileType === "mon") {
        try {
          await supabase.rpc("classify_warehouse_task_shifts");
        } catch {
          // best-effort
        }
        try {
          await supabase.rpc("link_tasks_to_orders");
        } catch {
          // best-effort
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
      user_id: userId,
      action: tokenId !== null ? "import_auto" : "import",
      entity: "imports",
      entity_id: String(importId),
      new_value: {
        file_name: fileName,
        file_type: fileType,
        total: rows.length,
        inserted,
        updated,
        rejected,
        ...(tokenName ? { robo: tokenName } : {}),
      },
    });

    if (tokenId !== null) {
      const { data: cur } = await supabase
        .from("ingestion_tokens")
        .select("use_count")
        .eq("id", tokenId)
        .maybeSingle();
      await supabase
        .from("ingestion_tokens")
        .update({
          last_used_at: new Date().toISOString(),
          last_used_type: fileType,
          use_count: (cur?.use_count ?? 0) + 1,
        })
        .eq("id", tokenId);
      console.log(
        `process-import: carga automática '${tokenName}' (${fileType}) — ${inserted} inseridas, ${updated} atualizadas, ${rejected} rejeitadas`,
      );
    }

    return res.json({
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
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Erro interno" });
  }
});
