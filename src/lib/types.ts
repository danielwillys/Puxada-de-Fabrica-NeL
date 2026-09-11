export type Role = "admin" | "manager" | "operator";
export type OrderStatus = "not_started" | "in_progress" | "completed" | "excess";

export type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info"
  | "default"
  | "secondary"
  | "outline";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  role_id: number | null;
  active: boolean;
}

export interface UserRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  role: Role;
  permissions: string[];
  is_system: boolean;
  active: boolean;
}

/** Permissões disponíveis no sistema (chaves usadas nos perfis). */
export const PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: "dashboard", label: "Dashboard", group: "Módulos" },
  { key: "orders", label: "Ordens de produção", group: "Módulos" },
  { key: "performance", label: "Performance", group: "Módulos" },
  { key: "import", label: "Importação de dados", group: "Módulos" },
  { key: "operators", label: "Operadores", group: "Módulos" },
  { key: "shifts", label: "Turnos", group: "Módulos" },
  { key: "schedules", label: "Escalas", group: "Módulos" },
  { key: "settings", label: "Configurações", group: "Módulos" },
  { key: "audit", label: "Auditoria", group: "Módulos" },
  { key: "users", label: "Usuários", group: "Administração" },
  { key: "roles", label: "Perfis e permissões", group: "Administração" },
  { key: "orders:reversal", label: "Estornar recebimentos", group: "Ações" },
  { key: "shifts:reprocess", label: "Reprocessar classificação", group: "Ações" },
];

export interface ProductionOrderMetric {
  id: number;
  order_number: string;
  material_code: string;
  material_description: string | null;
  unit: string | null;
  lot: string | null;
  planned_quantity: number;
  confirmed_quantity: number;
  sap_supplied_quantity: number;
  required_quantity: number;
  pulled_quantity: number;
  balance_quantity: number;
  excess_quantity: number;
  pull_efficiency_percent: number;
  status: OrderStatus;
  actual_start: string | null;
  actual_end: string | null;
  planned_start: string | null;
  created_date: string | null;
  first_pull_at: string | null;
  last_pull_at: string | null;
}

export interface ProductionReceipt {
  id: number;
  document_number: string;
  production_order: string;
  material_code: string;
  material_description: string | null;
  quantity: number;
  unit: string | null;
  lot: string | null;
  goods_receipt_status: string | null;
  warehouse_entry_status: string | null;
  goods_receipt_date: string | null;
  goods_receipt_time: string | null;
  process_type: string | null;
  storage_date: string | null;
  storage_time: string | null;
  is_valid: boolean;
  reversal_reason: string | null;
  reversed_at: string | null;
}

export interface WarehouseTask {
  id: number;
  warehouse_task: string;
  document: string | null;
  production_order: string | null;
  source_uc: string | null;
  material_code: string | null;
  material_description: string | null;
  lot: string | null;
  quantity: number;
  unit: string | null;
  process_type: string;
  task_status: string | null;
  goods_receipt_date: string | null;
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

export interface SapReconciliation {
  id: number;
  order_number: string;
  material_code: string;
  material_description: string | null;
  lot: string | null;
  unit: string | null;
  sap_quantity: number;
  physical_quantity: number;
  difference_quantity: number;
  classification: "ok" | "positive" | "negative";
}

export interface ImportRecord {
  id: number;
  file_name: string;
  file_type: "cooispi" | "recebimento" | "mon";
  imported_by: string | null;
  imported_at: string;
  total_records: number;
  inserted_records: number;
  updated_records: number;
  rejected_records: number;
  status: string;
  error_log: { row: number; errors: string[] }[] | null;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface SystemSetting {
  id: number;
  key: string;
  value: unknown;
  description: string | null;
}

export interface Shift {
  id: number;
  code: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  active: boolean;
}

export interface Operator {
  id: number;
  employee_number: string;
  name: string;
  role: string | null;
  active: boolean;
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; tone: BadgeTone }
> = {
  not_started: { label: "Não iniciada", tone: "neutral" },
  in_progress: { label: "Em andamento", tone: "warning" },
  completed: { label: "Finalizada", tone: "success" },
  excess: { label: "Excesso de materiais", tone: "danger" },
};

export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] =
  (Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((value) => ({
    value,
    label: ORDER_STATUS_META[value].label,
  }));

export const TASK_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  A: { label: "Estornada", tone: "danger" },
  B: { label: "Em espera", tone: "warning" },
  C: { label: "Confirmada", tone: "success" },
  "": { label: "Aberta", tone: "neutral" },
};

export function ROLE_LABEL(role: string): string {
  switch (role) {
    case "admin":
      return "Administrador";
    case "manager":
      return "Gerente";
    default:
      return "Operador";
  }
}

export const IMPORT_TYPE_META: Record<
  "cooispi" | "recebimento" | "mon",
  { label: string; description: string }
> = {
  cooispi: {
    label: "COOISPI — Ordens de Produção",
    description:
      "Quantidades planejadas, produzidas e fornecidas (SAP), lotes e datas de cada ordem de produção.",
  },
  recebimento: {
    label: "Recebimento — Entradas físicas",
    description:
      "Documentos de recebimento físico: paletes entrados da produção, com data/hora de EM e depósito.",
  },
  mon: {
    label: "MON / Puxada UC — Tarefas de depósito",
    description:
      "Tarefas de depósito 1020 (puxada) e 1012 (armazenagem), com autor, confirmado por e horários.",
  },
};
