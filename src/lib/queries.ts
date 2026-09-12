import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AuditLog,
  ImportRecord,
  Operator,
  OrderStatus,
  ProductionOrderMetric,
  ProductionReceipt,
  SapReconciliation,
  Shift,
  SystemSetting,
  UserRole,
  WarehouseTask,
} from "./types";
import { toLocalDateString } from "./format";

export type PeriodKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "month"
  | "prevMonth"
  | "custom";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "month", label: "Mês atual" },
  { value: "prevMonth", label: "Mês anterior" },
  { value: "custom", label: "Personalizado" },
];

export interface GlobalFilters {
  period: PeriodKey;
  startDate: string;
  endDate: string;
  orderNumber: string;
  material: string;
  lot: string;
  status: "" | OrderStatus;
  /** Id do turno ("" = todos). Usado pelas telas de performance. */
  shiftId: string;
  /** Dia operacional ("" = todos). Usado pelas telas de performance. */
  operationalDay: string;
}

export const EMPTY_FILTERS: GlobalFilters = {
  period: "30d",
  startDate: "",
  endDate: "",
  orderNumber: "",
  material: "",
  lot: "",
  status: "",
  shiftId: "",
  operationalDay: "",
};

export function periodToRange(
  period: PeriodKey,
  customStart = "",
  customEnd = "",
): { start: string; end: string } {
  const today = new Date();
  const to = toLocalDateString;
  switch (period) {
    case "today":
      return { start: to(today), end: to(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      return { start: to(y), end: to(y) };
    }
    case "7d": {
      const s = new Date(today);
      s.setDate(today.getDate() - 6);
      return { start: to(s), end: to(today) };
    }
    case "30d": {
      const s = new Date(today);
      s.setDate(today.getDate() - 29);
      return { start: to(s), end: to(today) };
    }
    case "month": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: to(s), end: to(e) };
    }
    case "prevMonth": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: to(s), end: to(e) };
    }
    case "custom":
    default:
      return { start: customStart, end: customEnd };
  }
}

/** Debounce rapid filter typing; returns both live and debounced copies. */
export function useDebouncedFilters(initial: GlobalFilters, delay = 300) {
  const [filters, setFilters] = useState<GlobalFilters>(initial);
  const [debounced, setDebounced] = useState<GlobalFilters>(initial);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), delay);
    return () => clearTimeout(t);
  }, [filters, delay]);
  return { filters, debounced, setFilters };
}

const METRICS_SELECT =
  "id,order_number,material_code,material_description,unit,lot,planned_quantity,confirmed_quantity,sap_supplied_quantity,required_quantity,pulled_quantity,balance_quantity,excess_quantity,pull_efficiency_percent,status,actual_start,actual_end,planned_start,created_date,first_pull_at,last_pull_at";

type Builder = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gte: (col: string, v: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lte: (col: string, v: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ilike: (col: string, v: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: (col: string, v: unknown) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  or: (f: string) => any;
};

function applyFilters(q: Builder, f: GlobalFilters): Builder {
  const range =
    f.period !== "custom"
      ? periodToRange(f.period)
      : { start: f.startDate, end: f.endDate };
  if (range.start && range.end) {
    // O período é filtrado pela data real de início da ordem (actual_start).
    // Ordens sem data real usam a data de criação como fallback.
    q = q.or(
      `and(actual_start.gte.${range.start}T00:00:00,actual_start.lte.${range.end}T23:59:59),and(actual_start.is.null,created_date.gte.${range.start}T00:00:00,created_date.lte.${range.end}T23:59:59)`,
    );
  }
  const order = f.orderNumber.trim();
  if (order) q = q.ilike("order_number", `%${order}%`);
  const material = f.material.trim();
  if (material) {
    q = q.or(
      `material_code.ilike.%${material}%,material_description.ilike.%${material}%`,
    );
  }
  const lot = f.lot.trim();
  if (lot) q = q.ilike("lot", `%${lot}%`);
  if (f.status) q = q.eq("status", f.status);
  return q;
}

function dateRangeOf(f: GlobalFilters) {
  return f.period !== "custom"
    ? periodToRange(f.period)
    : { start: f.startDate, end: f.endDate };
}

export function useMetrics(filters: GlobalFilters) {
  return useQuery({
    queryKey: ["metrics", filters],
    queryFn: async () => {
      let q = supabase.from("production_order_metrics").select(METRICS_SELECT);
      q = applyFilters(q as unknown as Builder, filters) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProductionOrderMetric[];
    },
    staleTime: 20_000,
  });
}

export function useReconciliation(filters: GlobalFilters) {
  return useQuery({
    queryKey: ["reconciliation", filters],
    queryFn: async () => {
      let q = supabase
        .from("sap_reconciliation")
        .select(
          "id,order_number,material_code,material_description,lot,unit,sap_quantity,physical_quantity,difference_quantity,classification",
        );
      const order = filters.orderNumber.trim();
      if (order) q = q.ilike("order_number", `%${order}%`);
      const material = filters.material.trim();
      if (material) {
        q = q.or(
          `material_code.ilike.%${material}%,material_description.ilike.%${material}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SapReconciliation[];
    },
    staleTime: 20_000,
  });
}

/** Daily pulled quantity from valid receipts within the filtered date range. */
export function useDailyPulled(filters: GlobalFilters) {
  return useQuery({
    queryKey: ["daily-pulled", filters],
    queryFn: async () => {
      const range = dateRangeOf(filters);
      let q = supabase
        .from("production_receipts")
        .select("goods_receipt_date,quantity")
        .eq("is_valid", true);
      if (range.start && range.end) {
        q = q.gte("goods_receipt_date", range.start).lte("goods_receipt_date", range.end);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as { goods_receipt_date: string | null; quantity: number }[];
    },
    staleTime: 20_000,
  });
}

/** Recebimentos estornados (is_valid = false) no período — para o card de controle. */
export function useReversedReceipts(filters: GlobalFilters) {
  return useQuery({
    queryKey: ["reversed-receipts", filters],
    queryFn: async () => {
      const range = dateRangeOf(filters);
      let q = supabase
        .from("production_receipts")
        .select("id,document_number,production_order,material_code,lot,quantity,unit,reversal_reason,reversed_at")
        .eq("is_valid", false);
      if (range.start && range.end) {
        q = q
          .gte("reversed_at", `${range.start}T00:00:00`)
          .lte("reversed_at", `${range.end}T23:59:59`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: number;
        document_number: string;
        production_order: string | null;
        material_code: string;
        lot: string | null;
        quantity: number;
        unit: string | null;
        reversal_reason: string | null;
        reversed_at: string | null;
      }[];
    },
    staleTime: 20_000,
  });
}

export interface OrdersPageParams {
  filters: GlobalFilters;
  search: string;
  page: number;
  pageSize: number;
  sortField: string;
  sortDir: "asc" | "desc";
}

export function useOrdersPage(params: OrdersPageParams) {
  const { filters, search, page, pageSize, sortField, sortDir } = params;
  return useQuery({
    queryKey: ["orders-page", filters, search, page, pageSize, sortField, sortDir],
    queryFn: async () => {
      let base = supabase
        .from("production_order_metrics")
        .select(METRICS_SELECT, { count: "exact" });
      base = applyFilters(base as unknown as Builder, filters) as typeof base;
      if (search.trim()) {
        const s = search.trim();
        base = base.or(
          `order_number.ilike.%${s}%,material_code.ilike.%${s}%,material_description.ilike.%${s}%`,
        );
      }
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      base = base.order(sortField, { ascending: sortDir === "asc" }).range(from, to);
      const { data, error, count } = await base;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as ProductionOrderMetric[],
        count: count ?? 0,
      };
    },
    staleTime: 20_000,
  });
}

/** All rows matching filters (no pagination) — used for Excel/CSV export. */
export function useOrdersExport(filters: GlobalFilters, search: string) {
  return useQuery({
    queryKey: ["orders-export", filters, search],
    queryFn: async () => {
      let q = supabase
        .from("production_order_metrics")
        .select(METRICS_SELECT)
        .limit(10000);
      q = applyFilters(q as unknown as Builder, filters) as typeof q;
      if (search.trim()) {
        const s = search.trim();
        q = q.or(
          `order_number.ilike.%${s}%,material_code.ilike.%${s}%,material_description.ilike.%${s}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProductionOrderMetric[];
    },
    staleTime: 20_000,
  });
}

export function useOrderMetrics(orderNumber: string) {
  return useQuery({
    queryKey: ["order-metrics", orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_order_metrics")
        .select(METRICS_SELECT)
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ProductionOrderMetric | null;
    },
  });
}

export function useOrderReceipts(orderNumber: string) {
  return useQuery({
    queryKey: ["order-receipts", orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_receipts")
        .select("*")
        .eq("production_order", orderNumber)
        .order("goods_receipt_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProductionReceipt[];
    },
  });
}

export function useOrderTasks(orderNumber: string) {
  return useQuery({
    queryKey: ["order-tasks", orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_tasks")
        .select("*")
        .eq("production_order", orderNumber)
        .order("creation_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WarehouseTask[];
    },
  });
}

export function useImports() {
  return useQuery({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .order("imported_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as ImportRecord[];
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SystemSetting[];
    },
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AuditLog[];
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,name,role")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        email: string;
        name: string;
        role: string;
      }[];
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------- master data

export function useShifts() {
  return useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Shift[];
    },
  });
}

export function useOperators() {
  return useQuery({
    queryKey: ["operators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operators")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Operator[];
    },
  });
}

export interface OperatorShiftAllocation {
  id: number;
  operator_id: number | null;
  shift_id: number | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
}

export function useOperatorShiftHistory() {
  return useQuery({
    queryKey: ["operator-shift-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operator_shift_history")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OperatorShiftAllocation[];
    },
  });
}

export interface WorkSchedule {
  id: number;
  name: string;
  description: string | null;
  shift_id: number | null;
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
  active: boolean;
}

// ---------------------------------------------------------- performance data

export interface PerformanceTask {
  id: number;
  warehouse_task: string;
  production_order: string | null;
  material_code: string | null;
  material_description: string | null;
  lot: string | null;
  quantity: number;
  unit: string | null;
  process_type: string;
  task_status: string | null;
  author: string | null;
  creation_date: string | null;
  creation_time: string | null;
  confirmed_by: string | null;
  confirmation_date: string | null;
  confirmation_time: string | null;
  pull_operator_id: number | null;
  storage_operator_id: number | null;
  pull_shift_id: number | null;
  storage_shift_id: number | null;
  operational_pull_day: string | null;
  operational_storage_day: string | null;
}

/**
 * Warehouse tasks with shift/operator classification within the filter range
 * (matched on operational pull OR storage day). Used by the performance screens.
 */
export function usePerformanceTasks(filters: GlobalFilters) {
  return useQuery({
    queryKey: ["performance-tasks", filters],
    queryFn: async () => {
      const range = dateRangeOf(filters);
      // PostgREST caps a response at 1000 rows; page through to fetch them all.
      const pageSize = 1000;
      const rows: PerformanceTask[] = [];
      for (let from = 0; ; from += pageSize) {
        let q = supabase
          .from("warehouse_tasks")
          .select(
            "id,warehouse_task,production_order,material_code,material_description,lot,quantity,unit,process_type,task_status,author,creation_date,creation_time,confirmed_by,confirmation_date,confirmation_time,pull_operator_id,storage_operator_id,pull_shift_id,storage_shift_id,operational_pull_day,operational_storage_day",
          )
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        // Each or() composes with AND — day range and shift filter stay independent.
        if (range.start && range.end) {
          q = q.or(
            `and(operational_pull_day.gte.${range.start},operational_pull_day.lte.${range.end}),and(operational_storage_day.gte.${range.start},operational_storage_day.lte.${range.end})`,
          );
        }
        if (filters.shiftId) {
          q = q.or(
            `pull_shift_id.eq.${filters.shiftId},storage_shift_id.eq.${filters.shiftId}`,
          );
        }
        if (filters.operationalDay) {
          q = q.or(
            `operational_pull_day.eq.${filters.operationalDay},operational_storage_day.eq.${filters.operationalDay}`,
          );
        }
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as unknown as PerformanceTask[];
        rows.push(...batch);
        if (batch.length < pageSize || from > 100_000) break;
      }
      return rows;
    },
    staleTime: 20_000,
  });
}

export function useWorkSchedules() {
  return useQuery({
    queryKey: ["work-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_schedules")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkSchedule[];
    },
  });
}

// ------------------------------------------------------------- administração

export interface UserAdminRow {
  id: string;
  email: string;
  name: string;
  role: string;
  role_id: number | null;
  active: boolean;
  role_name: string | null;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,name,role,role_id,active,user_roles(id,name)")
        .order("name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as {
          id: string;
          email: string;
          name: string;
          role: string;
          role_id: number | null;
          active: boolean;
          user_roles: { id: number; name: string } | null;
        };
        return {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          role_id: row.role_id,
          active: row.active,
          role_name: row.user_roles?.name ?? null,
        } as UserAdminRow;
      });
    },
    staleTime: 15_000,
  });
}

export function useUserRoles() {
  return useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as Record<string, unknown> & { permissions: unknown };
        return {
          ...row,
          permissions: Array.isArray(row.permissions)
            ? row.permissions.filter((p): p is string => typeof p === "string")
            : [],
        } as UserRole;
      });
    },
    staleTime: 15_000,
  });
}
