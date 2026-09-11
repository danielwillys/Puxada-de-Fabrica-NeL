import type { PerformanceTask } from "./queries";
import { parseLocalDateTime } from "./format";

export interface ShiftSummary {
  shiftId: number | null;
  code: string;
  name: string;
  pulls: number;
  pullQty: number;
  stores: number;
  storeQty: number;
  openTasks: number;
  waitingTasks: number;
  reversedTasks: number;
  confirmedTasks: number;
  /** Pairs puxada->armazenagem */
  pairs: number;
  avgMinutes: number | null;
  p90Minutes: number | null;
  slaPct: number | null;
  slaMinutes: number;
  daily: DailyPoint[];
}

export interface DailyPoint {
  day: string;
  pulls: number;
  stores: number;
  pullQty: number;
  storeQty: number;
}

export interface BacklogPoint {
  day: string;
  entradas: number;
  processadas: number;
  saldo: number;
}

export interface OperatorSummary {
  operatorId: number | null;
  name: string;
  role: string | null;
  shiftId: number | null;
  shiftCode: string;
  pulls: number;
  pullQty: number;
  stores: number;
  storeQty: number;
  pairs: number;
  avgMinutes: number | null;
  p90Minutes: number | null;
  slaPct: number | null;
  slaMinutes: number;
}

export interface CoverageDay {
  day: string;
  shiftId: number | null;
  shiftCode: string;
  allocated: number;
  worked: number;
  coveragePct: number;
}

export interface ShiftSummaryInput {
  id: number | null;
  code: string;
  name: string;
}

function pushDaily(
  map: Map<string, DailyPoint>,
  day: string,
  patch: Partial<DailyPoint>,
) {
  const cur = map.get(day) ?? {
    day,
    pulls: 0,
    stores: 0,
    pullQty: 0,
    storeQty: 0,
  };
  map.set(day, { ...cur, ...patch });
}

/** Pair each storage (1012) with its earliest unmatched pull (1020) of the same
 *  pallet (material+lot+quantity) whose creation happened at/before the storage
 *  confirmation — FIFO per pallet. Returns per-pair minutes. */
export function pairPullToStorage(
  tasks: PerformanceTask[],
): { minutes: number; pullShiftId: number | null; storeShiftId: number | null }[] {
  const key = (t: PerformanceTask) =>
    `${t.material_code ?? ""}\u0000${t.lot ?? ""}\u0000${t.quantity}`;
  const pullsByKey = new Map<string, { t: PerformanceTask; ts: Date }[]>();
  const storesByKey = new Map<string, { t: PerformanceTask; ts: Date }[]>();

  for (const t of tasks) {
    if (t.process_type === "1020") {
      const ts = parseLocalDateTime(t.creation_date, t.creation_time);
      if (!ts) continue;
      const arr = pullsByKey.get(key(t)) ?? [];
      arr.push({ t, ts });
      pullsByKey.set(key(t), arr);
    } else if (t.process_type === "1012") {
      const ts = parseLocalDateTime(t.confirmation_date, t.confirmation_time);
      if (!ts) continue;
      const arr = storesByKey.get(key(t)) ?? [];
      arr.push({ t, ts });
      storesByKey.set(key(t), arr);
    }
  }

  const out: { minutes: number; pullShiftId: number | null; storeShiftId: number | null }[] = [];
  for (const [k, pulls] of pullsByKey) {
    const stores = storesByKey.get(k);
    if (!stores) continue;
    pulls.sort((a, b) => a.ts.getTime() - b.ts.getTime() || a.t.id - b.t.id);
    stores.sort((a, b) => a.ts.getTime() - b.ts.getTime() || a.t.id - b.t.id);
    let p = 0;
    for (const st of stores) {
      if (p >= pulls.length) break;
      while (p < pulls.length && pulls[p].ts.getTime() <= st.ts.getTime()) {
        out.push({
          minutes: (st.ts.getTime() - pulls[p].ts.getTime()) / 60000,
          pullShiftId: pulls[p].t.pull_shift_id,
          storeShiftId: st.t.storage_shift_id,
        });
        p++;
        break;
      }
    }
  }
  return out;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function buildShiftSummaries(
  tasks: PerformanceTask[],
  shifts: ShiftSummaryInput[],
  slaMinutes: number,
): ShiftSummary[] {
  const pairs = pairPullToStorage(tasks);
  const minutesByShift = new Map<number | null, number[]>();
  for (const pr of pairs) {
    const arr = minutesByShift.get(pr.pullShiftId) ?? [];
    arr.push(pr.minutes);
    minutesByShift.set(pr.pullShiftId, arr);
  }

  return shifts.map((s) => {
    const id = s.id;
    const pulls = tasks.filter((t) => t.process_type === "1020" && t.pull_shift_id === id);
    const stores = tasks.filter((t) => t.process_type === "1012" && t.storage_shift_id === id);
    const dailyMap = new Map<string, DailyPoint>();
    for (const t of pulls) {
      const day = t.operational_pull_day ?? "sem dia";
      pushDaily(dailyMap, day, {
        pulls: (dailyMap.get(day)?.pulls ?? 0) + 1,
        pullQty: (dailyMap.get(day)?.pullQty ?? 0) + t.quantity,
      });
    }
    for (const t of stores) {
      const day = t.operational_storage_day ?? "sem dia";
      pushDaily(dailyMap, day, {
        stores: (dailyMap.get(day)?.stores ?? 0) + 1,
        storeQty: (dailyMap.get(day)?.storeQty ?? 0) + t.quantity,
      });
    }
    const daily = [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day));
    const minutes = minutesByShift.get(id) ?? [];
    const avg =
      minutes.length > 0
        ? minutes.reduce((a, b) => a + b, 0) / minutes.length
        : null;
    return {
      shiftId: id,
      code: s.code,
      name: s.name,
      pulls: pulls.length,
      pullQty: pulls.reduce((a, t) => a + t.quantity, 0),
      stores: stores.length,
      storeQty: stores.reduce((a, t) => a + t.quantity, 0),
      openTasks: pulls.filter((t) => (t.task_status ?? "") === "").length,
      waitingTasks: pulls.filter((t) => t.task_status === "B").length,
      reversedTasks: pulls.filter((t) => t.task_status === "A").length,
      confirmedTasks: pulls.filter((t) => t.task_status === "C").length,
      pairs: minutes.length,
      avgMinutes: avg,
      p90Minutes: percentile(minutes, 90),
      slaPct:
        minutes.length > 0
          ? (minutes.filter((m) => m <= slaMinutes).length / minutes.length) * 100
          : null,
      slaMinutes,
      daily,
    };
  });
}

export function buildBacklogByShift(
  tasks: PerformanceTask[],
  shifts: ShiftSummaryInput[],
): { shiftId: number | null; code: string; points: BacklogPoint[] }[] {
  return shifts.map((s) => {
    const id = s.id;
    const pulls = tasks.filter(
      (t) => t.process_type === "1020" && t.pull_shift_id === id && t.operational_pull_day,
    );
    const stores = tasks.filter(
      (t) => t.process_type === "1012" && t.storage_shift_id === id && t.operational_storage_day,
    );
    const entradas = new Map<string, number>();
    const processadas = new Map<string, number>();
    for (const t of pulls) {
      const d = t.operational_pull_day!;
      entradas.set(d, (entradas.get(d) ?? 0) + 1);
    }
    for (const t of stores) {
      const d = t.operational_storage_day!;
      processadas.set(d, (processadas.get(d) ?? 0) + 1);
    }
    const days = new Set([...entradas.keys(), ...processadas.keys()]);
    let saldo = 0;
    const points: BacklogPoint[] = [...days]
      .sort()
      .map((day) => {
        const e = entradas.get(day) ?? 0;
        const p = processadas.get(day) ?? 0;
        saldo = saldo + e - p;
        return { day, entradas: e, processadas: p, saldo };
      });
    return { shiftId: id, code: s.code, points };
  });
}

/** Metrics split by operator — pulls (1020, by author) and storages (1012, by
 *  confirmed_by), plus the storage-time metrics of the pairs attributed to the
 *  operator who pulled. */
export function buildOperatorSummaries(
  tasks: PerformanceTask[],
  operators: { id: number; name: string; role: string | null }[],
  shifts: ShiftSummaryInput[],
  slaMinutes: number,
): OperatorSummary[] {
  // Build operator -> tasks (pulls by author, stores by confirmed_by)
  const pullTasksByOp = new Map<number, PerformanceTask[]>();
  const storeTasksByOp = new Map<number, PerformanceTask[]>();
  for (const t of tasks) {
    if (t.process_type === "1020" && t.pull_operator_id !== null) {
      const arr = pullTasksByOp.get(t.pull_operator_id) ?? [];
      arr.push(t);
      pullTasksByOp.set(t.pull_operator_id, arr);
    } else if (t.process_type === "1012" && t.storage_operator_id !== null) {
      const arr = storeTasksByOp.get(t.storage_operator_id) ?? [];
      arr.push(t);
      storeTasksByOp.set(t.storage_operator_id, arr);
    }
  }

  const shiftById = new Map<number, ShiftSummaryInput>();
  for (const s of shifts) if (s.id !== null) shiftById.set(s.id, s);

  // All stores in the period, indexed by pallet key, for pairing pulls -> stores.
  const key = (t: PerformanceTask) =>
    `${t.material_code ?? ""}\u0000${t.lot ?? ""}\u0000${t.quantity}`;
  const allStoresByKey = new Map<string, { t: PerformanceTask; ts: Date }[]>();
  for (const t of tasks) {
    if (t.process_type !== "1012") continue;
    const ts = parseLocalDateTime(t.confirmation_date, t.confirmation_time);
    if (!ts) continue;
    const arr = allStoresByKey.get(key(t)) ?? [];
    arr.push({ t, ts });
    allStoresByKey.set(key(t), arr);
  }
  for (const arr of allStoresByKey.values())
    arr.sort((a, b) => a.ts.getTime() - b.ts.getTime());

  // FIFO pairing, attributing each pair to the operator who pulled the pallet.
  const usedStores = new Set<number>();
  const minutesByOperator = new Map<number, number[]>();
  const allPulls = tasks
    .filter(
      (t) =>
        t.process_type === "1020" &&
        t.pull_operator_id !== null &&
        t.creation_date &&
        t.creation_time,
    )
    .sort((a, b) => {
      const at = parseLocalDateTime(a.creation_date, a.creation_time)?.getTime() ?? 0;
      const bt = parseLocalDateTime(b.creation_date, b.creation_time)?.getTime() ?? 0;
      return at - bt || a.id - b.id;
    });
  for (const pull of allPulls) {
    const ts = parseLocalDateTime(pull.creation_date, pull.creation_time);
    if (!ts) continue;
    const candidates = allStoresByKey.get(key(pull)) ?? [];
    const match = candidates.find(
      (c) => !usedStores.has(c.t.id) && c.ts.getTime() >= ts.getTime(),
    );
    if (match) {
      usedStores.add(match.t.id);
      const arr = minutesByOperator.get(pull.pull_operator_id!) ?? [];
      arr.push((match.ts.getTime() - ts.getTime()) / 60000);
      minutesByOperator.set(pull.pull_operator_id!, arr);
    }
  }

  return operators.map((op) => {
    const pullTasks = pullTasksByOp.get(op.id) ?? [];
    const storeTasks = storeTasksByOp.get(op.id) ?? [];
    const shiftId = pullTasks[0]?.pull_shift_id ?? storeTasks[0]?.storage_shift_id ?? null;
    const shift = shiftId !== null ? shiftById.get(shiftId) : undefined;
    const minutes = minutesByOperator.get(op.id) ?? [];

    const avg =
      minutes.length > 0
        ? minutes.reduce((a, b) => a + b, 0) / minutes.length
        : null;
    return {
      operatorId: op.id,
      name: op.name,
      role: op.role,
      shiftId,
      shiftCode: shift ? shift.code : "Sem turno",
      pulls: pullTasks.length,
      pullQty: pullTasks.reduce((a, t) => a + t.quantity, 0),
      stores: storeTasks.length,
      storeQty: storeTasks.reduce((a, t) => a + t.quantity, 0),
      pairs: minutes.length,
      avgMinutes: avg,
      p90Minutes: percentile(minutes, 90),
      slaPct:
        minutes.length > 0
          ? (minutes.filter((m) => m <= slaMinutes).length / minutes.length) * 100
          : null,
      slaMinutes,
    };
  });
}

/** Hour x shift intensity of pull tasks (per operational day). */
export interface HeatCell {
  hour: number;
  shiftId: number | null;
  count: number;
}

export function buildPullHeatmap(
  tasks: PerformanceTask[],
  shifts: ShiftSummaryInput[],
): { shifts: ShiftSummaryInput[]; cells: HeatCell[] } {
  const cells: HeatCell[] = [];
  const shiftIds = new Set<number | null>(shifts.map((s) => s.id));
  for (const t of tasks) {
    if (t.process_type !== "1020") continue;
    if (!t.pull_shift_id && !shiftIds.has(t.pull_shift_id)) continue;
    const ts = parseLocalDateTime(t.creation_date, t.creation_time);
    if (!ts) continue;
    cells.push({ hour: ts.getHours(), shiftId: t.pull_shift_id, count: 1 });
  }
  return { shifts, cells };
}

/** Coverage: allocated operators (active allocation covering the day) vs
 *  operators that actually performed tasks on that day, per shift. */
export function buildCoverage(
  tasks: PerformanceTask[],
  shifts: ShiftSummaryInput[],
  history: {
    operator_id: number | null;
    shift_id: number | null;
    start_date: string;
    end_date: string | null;
    active: boolean;
  }[],
): CoverageDay[] {
  const workedMap = new Map<string, Set<number | null>>();
  const addWorked = (day: string, shiftId: number | null, opId: number | null) => {
    const k = `${day}\u0000${shiftId ?? "null"}`;
    const s = workedMap.get(k) ?? new Set();
    s.add(opId);
    workedMap.set(k, s);
  };
  for (const t of tasks) {
    if (t.process_type === "1020" && t.operational_pull_day)
      addWorked(t.operational_pull_day, t.pull_shift_id, t.pull_operator_id);
    else if (t.process_type === "1012" && t.operational_storage_day)
      addWorked(t.operational_storage_day, t.storage_shift_id, t.storage_operator_id);
  }

  const allocatedMap = new Map<string, Set<number | null>>();
  for (const h of history) {
    if (!h.active || h.operator_id === null || h.shift_id === null) continue;
    const start = new Date(`${h.start_date}T00:00:00`).getTime();
    const end = h.end_date
      ? new Date(`${h.end_date}T00:00:00`).getTime()
      : Number.MAX_SAFE_INTEGER;
    for (const key of workedMap.keys()) {
      const [day, shiftIdRaw] = key.split("\u0000");
      const t = new Date(`${day}T00:00:00`).getTime();
      if (t >= start && t <= end && Number(shiftIdRaw) === h.shift_id) {
        const s = allocatedMap.get(key) ?? new Set();
        s.add(h.operator_id);
        allocatedMap.set(key, s);
      }
    }
  }

  const days = new Set([...workedMap.keys()].map((k) => k.split("\u0000")[0]));
  const out: CoverageDay[] = [];
  for (const day of [...days].sort()) {
    for (const s of shifts) {
      const key = `${day}\u0000${s.id ?? "null"}`;
      const worked = workedMap.get(key)?.size ?? 0;
      const allocated = allocatedMap.get(key)?.size ?? 0;
      if (worked === 0 && allocated === 0) continue;
      out.push({
        day: String(day),
        shiftId: s.id,
        shiftCode: s.code,
        allocated,
        worked,
        coveragePct:
          allocated > 0 ? Math.round((worked / allocated) * 100) : worked > 0 ? 100 : 0,
      });
    }
  }
  return out;
}
