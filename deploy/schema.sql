-- ============================================================
-- CONVERGE.AI — Puxada de Fábrica N&L
-- Schema completo PostgreSQL (gerado das migrações, em ordem)
-- Instalação: psql -U <usuario> -d <banco> -f deploy/schema.sql
-- ============================================================

-- ############################################################
-- migration_20260910_205426000
-- ############################################################
-- ============================================================
-- CONVERGE.AI Phase 1 foundation migration (fixed ordering)
-- ============================================================

-- ---------- Enums ----------
create type public.user_role as enum ('admin', 'manager', 'operator');
create type public.order_status as enum ('not_started', 'in_progress', 'completed', 'excess');

-- ---------- Generic updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role public.user_role not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  v_role := 'operator';
  if (select count(*) from public.profiles) = 0 then
    v_role := 'admin';
  end if;
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,'user'),'@',1)), v_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Helper: current user role (security definer, avoids RLS recursion) ----------
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
create policy "profiles_admin_all" on public.profiles
  for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and public.current_user_role() = role);

-- ---------- operators ----------
create table public.operators (
  id bigserial primary key,
  employee_number text not null unique,
  name text not null,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger operators_set_updated_at
  before update on public.operators for each row execute function public.set_updated_at();
alter table public.operators enable row level security;
create policy "operators_select" on public.operators for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "operators_write" on public.operators for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create index idx_operators_name on public.operators(name);

-- ---------- shifts ----------
create table public.shifts (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  description text,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shifts_set_updated_at
  before update on public.shifts for each row execute function public.set_updated_at();
alter table public.shifts enable row level security;
create policy "shifts_select" on public.shifts for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "shifts_write" on public.shifts for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

-- ---------- work_schedules ----------
create table public.work_schedules (
  id bigserial primary key,
  name text not null,
  description text,
  shift_id bigint references public.shifts(id),
  weekday smallint not null,
  start_time time,
  end_time time,
  break_start time,
  break_end time,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger work_schedules_set_updated_at
  before update on public.work_schedules for each row execute function public.set_updated_at();
alter table public.work_schedules enable row level security;
create policy "work_schedules_select" on public.work_schedules for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "work_schedules_write" on public.work_schedules for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create index idx_work_schedules_shift on public.work_schedules(shift_id);

-- ---------- operator_shift_history ----------
create table public.operator_shift_history (
  id bigserial primary key,
  operator_id bigint references public.operators(id),
  shift_id bigint references public.shifts(id),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger osh_set_updated_at
  before update on public.operator_shift_history for each row execute function public.set_updated_at();
alter table public.operator_shift_history enable row level security;
create policy "osh_select" on public.operator_shift_history for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "osh_write" on public.operator_shift_history for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create index idx_osh_operator on public.operator_shift_history(operator_id);
create index idx_osh_shift on public.operator_shift_history(shift_id);

-- ---------- production_orders ----------
create table public.production_orders (
  id bigserial primary key,
  order_number text not null unique,
  material_code text not null,
  material_description text,
  planned_quantity numeric(18,3) not null default 0,
  confirmed_quantity numeric(18,3) not null default 0,
  sap_supplied_quantity numeric(18,3) not null default 0,
  required_pull_quantity numeric(18,3) not null default 0,
  unit text,
  lot text,
  actual_start timestamptz,
  actual_end timestamptz,
  planned_start timestamptz,
  created_date timestamptz,
  status public.order_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger production_orders_set_updated_at
  before update on public.production_orders for each row execute function public.set_updated_at();
alter table public.production_orders enable row level security;
create policy "orders_select" on public.production_orders for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "orders_write" on public.production_orders for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create index idx_orders_material on public.production_orders(material_code);
create index idx_orders_lot on public.production_orders(lot);
create index idx_orders_created_date on public.production_orders(created_date);
create index idx_orders_actual_start on public.production_orders(actual_start);
create index idx_orders_status on public.production_orders(status);

-- ---------- production_receipts ----------
create table public.production_receipts (
  id bigserial primary key,
  document_number text not null,
  production_order text not null,
  material_code text not null,
  material_description text,
  quantity numeric(18,3) not null default 0,
  unit text,
  lot text,
  goods_receipt_status text,
  warehouse_entry_status text,
  goods_receipt_date date,
  goods_receipt_time time,
  process_type text,
  storage_date date,
  storage_time time,
  is_valid boolean not null default true,
  dedup_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger receipts_set_updated_at
  before update on public.production_receipts for each row execute function public.set_updated_at();
alter table public.production_receipts enable row level security;
create policy "receipts_select" on public.production_receipts for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "receipts_write" on public.production_receipts for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create index idx_receipts_order on public.production_receipts(production_order);
create index idx_receipts_material on public.production_receipts(material_code);
create index idx_receipts_lot on public.production_receipts(lot);
create index idx_receipts_document on public.production_receipts(document_number);
create index idx_receipts_goods_date on public.production_receipts(goods_receipt_date);

-- ---------- warehouse_tasks ----------
create table public.warehouse_tasks (
  id bigserial primary key,
  warehouse_task text not null,
  document text,
  production_order text,
  source_uc text,
  material_code text,
  material_description text,
  lot text,
  quantity numeric(18,3) not null default 0,
  unit text,
  process_type text not null,
  task_status text,
  goods_receipt_date date,
  author text,
  creation_date date,
  creation_time time,
  confirmed_by text,
  confirmation_date date,
  confirmation_time time,
  pull_operator_id bigint references public.operators(id),
  storage_operator_id bigint references public.operators(id),
  pull_shift_id bigint references public.shifts(id),
  storage_shift_id bigint references public.shifts(id),
  operational_pull_day date,
  operational_storage_day date,
  dedup_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger warehouse_tasks_set_updated_at
  before update on public.warehouse_tasks for each row execute function public.set_updated_at();
alter table public.warehouse_tasks enable row level security;
create policy "tasks_select" on public.warehouse_tasks for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "tasks_write" on public.warehouse_tasks for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create index idx_tasks_order on public.warehouse_tasks(production_order);
create index idx_tasks_material on public.warehouse_tasks(material_code);
create index idx_tasks_uc on public.warehouse_tasks(source_uc);
create index idx_tasks_document on public.warehouse_tasks(document);
create index idx_tasks_process on public.warehouse_tasks(process_type);
create index idx_tasks_creation on public.warehouse_tasks(creation_date);
create index idx_tasks_confirmation on public.warehouse_tasks(confirmation_date);
create index idx_tasks_pull_day on public.warehouse_tasks(operational_pull_day);
create index idx_tasks_storage_day on public.warehouse_tasks(operational_storage_day);
create index idx_tasks_pull_op on public.warehouse_tasks(pull_operator_id);
create index idx_tasks_storage_op on public.warehouse_tasks(storage_operator_id);
create index idx_tasks_status on public.warehouse_tasks(task_status);

-- ---------- imports ----------
create table public.imports (
  id bigserial primary key,
  file_name text not null,
  file_type text not null,
  imported_by uuid references auth.users(id),
  imported_at timestamptz not null default now(),
  total_records integer not null default 0,
  inserted_records integer not null default 0,
  updated_records integer not null default 0,
  rejected_records integer not null default 0,
  status text not null default 'processing',
  error_log jsonb
);
alter table public.imports enable row level security;
create policy "imports_select" on public.imports for select
  using (public.current_user_role() in ('admin','manager'));
create policy "imports_write" on public.imports for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create index idx_imports_at on public.imports(imported_at);

-- ---------- system_settings ----------
create table public.system_settings (
  id bigserial primary key,
  key text not null unique,
  value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger system_settings_set_updated_at
  before update on public.system_settings for each row execute function public.set_updated_at();
alter table public.system_settings enable row level security;
create policy "settings_select" on public.system_settings for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "settings_write" on public.system_settings for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

insert into public.system_settings (key, value, description) values
  ('pull_completion_basis', '"confirmed"', 'Base para conclusão da puxada: confirmed | planned | min'),
  ('storage_sla_minutes', '30', 'SLA de armazenagem em minutos'),
  ('backlog_ranges', '[{"min":0,"max":30,"label":"0-30 min"},{"min":31,"max":60,"label":"31-60 min"},{"min":61,"max":120,"label":"61-120 min"},{"min":121,"max":null,"label":"> 120 min"}]', 'Faixas de backlog configuraveis');

-- ---------- audit_logs ----------
create table public.audit_logs (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy "audit_select" on public.audit_logs for select
  using (public.current_user_role() = 'admin');
create index idx_audit_entity on public.audit_logs(entity, entity_id);
create index idx_audit_at on public.audit_logs(created_at);

-- ---------- get_shift_for_datetime ----------
create or replace function public.get_shift_for_datetime(p_operator_id bigint, p_datetime timestamptz)
returns table (shift_id bigint, operational_day date)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_local_time time;
  v_shift_id bigint;
  v_crosses boolean;
  v_start_time time;
  v_end_time time;
begin
  if p_operator_id is null or p_datetime is null then
    return query select null::bigint, null::date;
    return;
  end if;

  select osh.shift_id into v_shift_id
  from public.operator_shift_history osh
  where osh.operator_id = p_operator_id
    and osh.active
    and osh.start_date <= p_datetime::date
    and (osh.end_date is null or osh.end_date >= p_datetime::date)
  order by osh.start_date desc, osh.id desc
  limit 1;

  if v_shift_id is null then
    return query select null::bigint, null::date;
    return;
  end if;

  select s.crosses_midnight, s.start_time, s.end_time
    into v_crosses, v_start_time, v_end_time
  from public.shifts s
  where s.id = v_shift_id and s.active;

  if v_crosses is null then
    return query select null::bigint, null::date;
    return;
  end if;

  v_local_time := p_datetime::time;

  if v_crosses then
    if not (v_local_time >= v_start_time or v_local_time < v_end_time) then
      return query select null::bigint, null::date;
      return;
    end if;
  else
    if not (v_local_time >= v_start_time and v_local_time < v_end_time) then
      return query select null::bigint, null::date;
      return;
    end if;
  end if;

  if v_crosses and v_local_time < v_end_time then
    return query select v_shift_id, (p_datetime::date - 1);
  else
    return query select v_shift_id, p_datetime::date;
  end if;
end;
$$;

-- ---------- production_order_metrics view ----------
create view public.production_order_metrics as
with basis as (
  select coalesce((select value from public.system_settings where key = 'pull_completion_basis')::text, 'confirmed') as pull_basis
),
order_base as (
  select
    po.id,
    po.order_number,
    po.material_code,
    po.material_description,
    po.unit,
    po.lot,
    po.planned_quantity,
    po.confirmed_quantity,
    po.sap_supplied_quantity,
    po.actual_start,
    po.actual_end,
    po.planned_start,
    po.created_date,
    case
      when b.pull_basis = 'planned' then po.planned_quantity
      when b.pull_basis = 'min' then least(coalesce(po.planned_quantity,0), coalesce(po.confirmed_quantity,0))
      else coalesce(nullif(coalesce(po.confirmed_quantity,0),0), po.planned_quantity)
    end as required_quantity
  from public.production_orders po
  cross join basis b
),
pulled as (
  select
    production_order,
    coalesce(sum(quantity),0) as pulled_quantity,
    count(*) as receipt_count
  from public.production_receipts
  where is_valid
  group by production_order
)
select
  ob.id,
  ob.order_number,
  ob.material_code,
  ob.material_description,
  ob.unit,
  ob.lot,
  ob.planned_quantity,
  ob.confirmed_quantity,
  ob.sap_supplied_quantity,
  ob.required_quantity,
  coalesce(p.pulled_quantity,0) as pulled_quantity,
  greatest(coalesce(ob.required_quantity,0) - coalesce(p.pulled_quantity,0), 0) as balance_quantity,
  greatest(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0), 0) as excess_quantity,
  case
    when coalesce(ob.required_quantity,0) > 0
    then least(100, round(coalesce(p.pulled_quantity,0) / ob.required_quantity * 100, 2))
    else 0
  end as pull_efficiency_percent,
  case
    when coalesce(p.pulled_quantity,0) = 0 then 'not_started'
    when abs(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0)) <= 0.001 then 'completed'
    when coalesce(p.pulled_quantity,0) < coalesce(ob.required_quantity,0) then 'in_progress'
    else 'excess'
  end::public.order_status as status,
  ob.actual_start,
  ob.actual_end,
  ob.planned_start,
  ob.created_date
from order_base ob
left join pulled p on p.production_order = ob.order_number;

-- ---------- sap_reconciliation view ----------
create view public.sap_reconciliation as
select
  po.id,
  po.order_number,
  po.material_code,
  po.material_description,
  po.lot,
  po.unit,
  po.sap_supplied_quantity as sap_quantity,
  m.pulled_quantity as physical_quantity,
  round(coalesce(po.sap_supplied_quantity,0) - coalesce(m.pulled_quantity,0), 3) as difference_quantity,
  case
    when abs(coalesce(po.sap_supplied_quantity,0) - coalesce(m.pulled_quantity,0)) <= 0.001 then 'ok'
    when coalesce(m.pulled_quantity,0) > coalesce(po.sap_supplied_quantity,0) then 'positive'
    else 'negative'
  end as classification
from public.production_orders po
left join public.production_order_metrics m on m.id = po.id;

-- ---------- refresh_order_metrics: recompute status after imports ----------
create or replace function public.refresh_order_metrics()
returns void
language sql
security definer
stable
set search_path = public
as $$
  update public.production_orders po
  set required_pull_quantity = m.required_quantity,
      status = m.status,
      updated_at = now()
  from public.production_order_metrics m
  where m.id = po.id;
$$;


-- ############################################################
-- migration_20260910_205533000
-- ############################################################
-- classify MON warehouse task shifts/operational days (backend-side)
create or replace function public.classify_warehouse_task_shifts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_shift bigint;
  v_day date;
begin
  for r in
    select
      t.id,
      t.author,
      t.confirmed_by,
      t.process_type,
      case when t.creation_date is not null and t.creation_time is not null
           then (t.creation_date + t.creation_time)::timestamp end as pull_ts,
      case when t.confirmation_date is not null and t.confirmation_time is not null
           then (t.confirmation_date + t.confirmation_time)::timestamp end as storage_ts,
      o.id as author_operator,
      o2.id as confirmed_operator
    from public.warehouse_tasks t
    left join public.operators o
      on (o.name = trim(coalesce(t.author,'')) or o.employee_number = trim(coalesce(t.author,'')))
    left join public.operators o2
      on (o2.name = trim(coalesce(t.confirmed_by,'')) or o2.employee_number = trim(coalesce(t.confirmed_by,'')))
    where t.pull_operator_id is null or t.storage_operator_id is null
  loop
    if r.process_type = '1020' and r.pull_ts is not null and r.author_operator is not null then
      select g.shift_id, g.operational_day into v_shift, v_day
      from public.get_shift_for_datetime(r.author_operator, r.pull_ts) g;
      update public.warehouse_tasks
      set pull_operator_id = r.author_operator,
          pull_shift_id = v_shift,
          operational_pull_day = v_day
      where id = r.id;
    end if;
    if r.process_type = '1012' and r.storage_ts is not null and r.confirmed_operator is not null then
      select g.shift_id, g.operational_day into v_shift, v_day
      from public.get_shift_for_datetime(r.confirmed_operator, r.storage_ts) g;
      update public.warehouse_tasks
      set storage_operator_id = r.confirmed_operator,
          storage_shift_id = v_shift,
          operational_storage_day = v_day
      where id = r.id;
    end if;
  end loop;
end;
$$;

-- ############################################################
-- migration_20260910_205751000
-- ############################################################
-- Extend metrics view with pull timestamps; settings audit trigger; volatility fix

create or replace view public.production_order_metrics as
with basis as (
  select coalesce((select value from public.system_settings where key = 'pull_completion_basis')::text, 'confirmed') as pull_basis
),
order_base as (
  select
    po.id,
    po.order_number,
    po.material_code,
    po.material_description,
    po.unit,
    po.lot,
    po.planned_quantity,
    po.confirmed_quantity,
    po.sap_supplied_quantity,
    po.actual_start,
    po.actual_end,
    po.planned_start,
    po.created_date,
    case
      when b.pull_basis = 'planned' then po.planned_quantity
      when b.pull_basis = 'min' then least(coalesce(po.planned_quantity,0), coalesce(po.confirmed_quantity,0))
      else coalesce(nullif(coalesce(po.confirmed_quantity,0),0), po.planned_quantity)
    end as required_quantity
  from public.production_orders po
  cross join basis b
),
pulled as (
  select
    production_order,
    coalesce(sum(quantity),0) as pulled_quantity,
    count(*) as receipt_count
  from public.production_receipts
  where is_valid
  group by production_order
),
pull_times as (
  select
    production_order,
    min(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as first_pull_at,
    max(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as last_pull_at
  from public.warehouse_tasks
  where process_type = '1020'
  group by production_order
)
select
  ob.id,
  ob.order_number,
  ob.material_code,
  ob.material_description,
  ob.unit,
  ob.lot,
  ob.planned_quantity,
  ob.confirmed_quantity,
  ob.sap_supplied_quantity,
  ob.required_quantity,
  coalesce(p.pulled_quantity,0) as pulled_quantity,
  greatest(coalesce(ob.required_quantity,0) - coalesce(p.pulled_quantity,0), 0) as balance_quantity,
  greatest(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0), 0) as excess_quantity,
  case
    when coalesce(ob.required_quantity,0) > 0
    then least(100, round(coalesce(p.pulled_quantity,0) / ob.required_quantity * 100, 2))
    else 0
  end as pull_efficiency_percent,
  case
    when coalesce(p.pulled_quantity,0) = 0 then 'not_started'
    when abs(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0)) <= 0.001 then 'completed'
    when coalesce(p.pulled_quantity,0) < coalesce(ob.required_quantity,0) then 'in_progress'
    else 'excess'
  end::public.order_status as status,
  ob.actual_start,
  ob.actual_end,
  ob.planned_start,
  ob.created_date,
  pt.first_pull_at,
  pt.last_pull_at
from order_base ob
left join pulled p on p.production_order = ob.order_number
left join pull_times pt on pt.production_order = ob.order_number;

-- audit settings changes
create or replace function public.log_setting_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(), 'update', 'system_settings', new.key, to_jsonb(old.value), to_jsonb(new.value));
  return new;
end;
$$;

create trigger system_settings_audit
  after update on public.system_settings
  for each row execute function public.log_setting_change();

-- refresh_order_metrics performs writes, must be volatile
create or replace function public.refresh_order_metrics()
returns void
language sql
security definer
volatile
set search_path = public
as $$
  update public.production_orders po
  set required_pull_quantity = m.required_quantity,
      status = m.status,
      updated_at = now()
  from public.production_order_metrics m
  where m.id = po.id;
$$;

-- ############################################################
-- migration_20260910_210625000
-- ############################################################
-- 1) Fix pull_times to exclude reversed tasks, 2) fix reconciliation sign, 3) remove verification test data

create or replace view public.production_order_metrics as
with basis as (
  select coalesce((select value from public.system_settings where key = 'pull_completion_basis')::text, 'confirmed') as pull_basis
),
order_base as (
  select
    po.id,
    po.order_number,
    po.material_code,
    po.material_description,
    po.unit,
    po.lot,
    po.planned_quantity,
    po.confirmed_quantity,
    po.sap_supplied_quantity,
    po.actual_start,
    po.actual_end,
    po.planned_start,
    po.created_date,
    case
      when b.pull_basis = 'planned' then po.planned_quantity
      when b.pull_basis = 'min' then least(coalesce(po.planned_quantity,0), coalesce(po.confirmed_quantity,0))
      else coalesce(nullif(coalesce(po.confirmed_quantity,0),0), po.planned_quantity)
    end as required_quantity
  from public.production_orders po
  cross join basis b
),
pulled as (
  select
    production_order,
    coalesce(sum(quantity),0) as pulled_quantity,
    count(*) as receipt_count
  from public.production_receipts
  where is_valid
  group by production_order
),
pull_times as (
  select
    production_order,
    min(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as first_pull_at,
    max(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as last_pull_at
  from public.warehouse_tasks
  where process_type = '1020'
    and task_status is distinct from 'A'
  group by production_order
)
select
  ob.id,
  ob.order_number,
  ob.material_code,
  ob.material_description,
  ob.unit,
  ob.lot,
  ob.planned_quantity,
  ob.confirmed_quantity,
  ob.sap_supplied_quantity,
  ob.required_quantity,
  coalesce(p.pulled_quantity,0) as pulled_quantity,
  greatest(coalesce(ob.required_quantity,0) - coalesce(p.pulled_quantity,0), 0) as balance_quantity,
  greatest(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0), 0) as excess_quantity,
  case
    when coalesce(ob.required_quantity,0) > 0
    then least(100, round(coalesce(p.pulled_quantity,0) / ob.required_quantity * 100, 2))
    else 0
  end as pull_efficiency_percent,
  case
    when coalesce(p.pulled_quantity,0) = 0 then 'not_started'
    when abs(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0)) <= 0.001 then 'completed'
    when coalesce(p.pulled_quantity,0) < coalesce(ob.required_quantity,0) then 'in_progress'
    else 'excess'
  end::public.order_status as status,
  ob.actual_start,
  ob.actual_end,
  ob.planned_start,
  ob.created_date,
  pt.first_pull_at,
  pt.last_pull_at
from order_base ob
left join pulled p on p.production_order = ob.order_number
left join pull_times pt on pt.production_order = ob.order_number;

create or replace view public.sap_reconciliation as
select
  po.id,
  po.order_number,
  po.material_code,
  po.material_description,
  po.lot,
  po.unit,
  po.sap_supplied_quantity as sap_quantity,
  m.pulled_quantity as physical_quantity,
  round(coalesce(m.pulled_quantity,0) - coalesce(po.sap_supplied_quantity,0), 3) as difference_quantity,
  case
    when abs(coalesce(po.sap_supplied_quantity,0) - coalesce(m.pulled_quantity,0)) <= 0.001 then 'ok'
    when coalesce(m.pulled_quantity,0) > coalesce(po.sap_supplied_quantity,0) then 'positive'
    else 'negative'
  end as classification
from public.production_orders po
left join public.production_order_metrics m on m.id = po.id;

-- remove the functional-test dataset (orders 999xxxx / tasks T9xxx)
delete from public.warehouse_tasks where production_order like '999%' or warehouse_task like 'T9%';
delete from public.production_receipts where production_order like '999%';
delete from public.production_orders where order_number like '999%';

-- ############################################################
-- migration_20260910_235022000
-- ############################################################
-- Remove the rows imported with corrupted dates/times (12h + MM/DD misread)
-- so the corrected import can run cleanly without duplicates.
delete from public.warehouse_tasks;
delete from public.production_receipts;
delete from public.production_orders;
-- reset stored order metrics
update public.production_orders set status = 'not_started', required_pull_quantity = 0;

-- ############################################################
-- migration_20260911_003722000
-- ############################################################
-- Audit every change to master data (shifts, operators, schedules, allocations)
create or replace function public.log_master_data_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert'; v_id := new.id::text;
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_id := new.id::text;
  else
    v_action := 'delete'; v_id := old.id::text;
  end if;
  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (
    auth.uid(), v_action, tg_table_name, v_id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists shifts_audit on public.shifts;
create trigger shifts_audit after insert or update or delete on public.shifts
  for each row execute function public.log_master_data_change();

drop trigger if exists operators_audit on public.operators;
create trigger operators_audit after insert or update or delete on public.operators
  for each row execute function public.log_master_data_change();

drop trigger if exists work_schedules_audit on public.work_schedules;
create trigger work_schedules_audit after insert or update or delete on public.work_schedules
  for each row execute function public.log_master_data_change();

drop trigger if exists osh_audit on public.operator_shift_history;
create trigger osh_audit after insert or update or delete on public.operator_shift_history
  for each row execute function public.log_master_data_change();

-- Reject conflicting allocation periods for the same operator
create or replace function public.check_operator_shift_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operator_id is not null and new.active then
    if exists (
      select 1
      from public.operator_shift_history h
      where h.operator_id = new.operator_id
        and h.id <> coalesce(new.id, -1)
        and h.active
        and daterange(h.start_date, coalesce(h.end_date, '9999-12-31'::date), '[]')
            && daterange(new.start_date, coalesce(new.end_date, '9999-12-31'::date), '[]')
    ) then
      raise exception 'Ja existe uma alocacao de turno nesse periodo para este operador';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists osh_overlap_check on public.operator_shift_history;
create trigger osh_overlap_check before insert or update on public.operator_shift_history
  for each row execute function public.check_operator_shift_overlap();

-- ############################################################
-- migration_20260911_003745000
-- ############################################################
-- Reprocess shift/operational-day classification from scratch (used after
-- shift hours or operator allocations change).
create or replace function public.reprocess_shift_classification()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.warehouse_tasks
  set pull_operator_id = null,
      storage_operator_id = null,
      pull_shift_id = null,
      storage_shift_id = null,
      operational_pull_day = null,
      operational_storage_day = null;
  perform public.classify_warehouse_task_shifts();
end;
$$;

-- ############################################################
-- migration_20260911_011159000
-- ############################################################
-- Assign an operator to a shift, closing the previous active allocation at
-- the new start date (an explicit correction that preserves history).
create or replace function public.assign_operator_shift(
  p_operator_id bigint,
  p_shift_id bigint,
  p_start_date date,
  p_end_date date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict text;
begin
  if p_operator_id is null or p_shift_id is null or p_start_date is null then
    return 'Informe operador, turno e data de início.';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    return 'A data de fim não pode ser anterior à data de início.';
  end if;

  -- Hard conflict: an active allocation that begins inside the new period
  -- cannot be resolved by closing the previous one — the operator must close it
  -- first or choose a later start date.
  select coalesce(string_agg(h.id::text, ','), '') into v_conflict
  from public.operator_shift_history h
  where h.operator_id = p_operator_id
    and h.active
    and h.start_date >= p_start_date
    and daterange(h.start_date, coalesce(h.end_date, '9999-12-31'::date), '[]')
        && daterange(p_start_date, coalesce(p_end_date, '9999-12-31'::date), '[]');

  if v_conflict <> '' then
    return 'Conflito: este operador já possui alocação ativa iniciando dentro do período informado. Encerre a alocação atual primeiro.';
  end if;

  -- Close previous active allocations that end when the new one starts.
  update public.operator_shift_history
  set end_date = p_start_date - 1,
      active = false
  where operator_id = p_operator_id
    and active
    and start_date < p_start_date;

  insert into public.operator_shift_history
    (operator_id, shift_id, start_date, end_date, active)
  values (p_operator_id, p_shift_id, p_start_date, p_end_date, true);

  return 'ok';
end;
$$;

-- ############################################################
-- migration_20260911_011907000
-- ############################################################
select public.reprocess_shift_classification();

-- ############################################################
-- migration_20260911_012740000
-- ############################################################
-- Extend operator->shift allocations back to 2026-08-01 (min task date) so historical tasks classify.
-- Earliest allocation per operator gets the earlier start; TSOUZA's T1 period (id 17) is reactivated
-- so his pre-09-11 pulls classify as 1o TURNO, while his current ADM allocation (id 22) stays from 09-11.
update public.operator_shift_history osh
set start_date = '2026-08-01'::date
where osh.id in (
  select distinct on (operator_id) id
  from public.operator_shift_history
  order by operator_id, start_date asc, id asc
);

update public.operator_shift_history
set active = true
where id = 17;

-- Re-run shift classification for all warehouse tasks.
select public.reprocess_shift_classification();

-- ############################################################
-- migration_20260911_013055000
-- ############################################################
-- Align operator shift assignments with actual work times observed in warehouse_tasks.
-- IFERNANDES stores 685 tasks in 1o Turno hours -> T1
-- DLOPES pulls 2305 tasks in 1o Turno hours -> T1
-- JDESOUSA works 1o Turno hours -> T1
-- AMSILVA pulls mostly 2o Turno hours -> T2
-- DDASILVA pulls 2o Turno hours -> T2
-- ROBORGES pulls 2o Turno hours -> T2
update public.operator_shift_history
set shift_id = 1
where operator_id in (1, 6, 10);

update public.operator_shift_history
set shift_id = 3
where operator_id in (12, 13, 14);

-- Re-run classification with corrected assignments.
select public.reprocess_shift_classification();

-- ############################################################
-- migration_20260911_162056000
-- ############################################################
-- Set-based classify: replaces the per-row plpgsql loop (faster, no timeout).
create or replace function public.classify_warehouse_task_shifts()
returns void
language sql
security definer
set search_path = public
as $$
  -- Pulls (1020): author + creation ts -> pull operator/shift/day
  update public.warehouse_tasks t
  set pull_operator_id = m.operator_id,
      pull_shift_id = m.shift_id,
      operational_pull_day = m.operational_day
  from (
    select t2.id as task_id,
           o.id as operator_id,
           g.shift_id,
           g.operational_day
    from public.warehouse_tasks t2
    join public.operators o
      on (o.name = trim(coalesce(t2.author,'')) or o.employee_number = trim(coalesce(t2.author,'')))
    cross join lateral public.get_shift_for_datetime(o.id, (t2.creation_date + t2.creation_time)::timestamp) g
    where t2.process_type = '1020'
      and t2.creation_date is not null and t2.creation_time is not null
      and g.shift_id is not null
  ) m
  where t.id = m.task_id;

  -- Storages (1012): confirmed_by + confirmation ts -> storage operator/shift/day
  update public.warehouse_tasks t
  set storage_operator_id = m.operator_id,
      storage_shift_id = m.shift_id,
      operational_storage_day = m.operational_day
  from (
    select t2.id as task_id,
           o.id as operator_id,
           g.shift_id,
           g.operational_day
    from public.warehouse_tasks t2
    join public.operators o
      on (o.name = trim(coalesce(t2.confirmed_by,'')) or o.employee_number = trim(coalesce(t2.confirmed_by,'')))
    cross join lateral public.get_shift_for_datetime(o.id, (t2.confirmation_date + t2.confirmation_time)::timestamp) g
    where t2.process_type = '1012'
      and t2.confirmation_date is not null and t2.confirmation_time is not null
      and g.shift_id is not null
  ) m
  where t.id = m.task_id;
$$;

-- Reprocess everything with the new function.
select public.reprocess_shift_classification();

-- ############################################################
-- migration_20260911_162322000
-- ############################################################
-- Estorno de recebimento: rastreio do motivo e da data do estorno.
alter table public.production_receipts
  add column if not exists reversal_reason text,
  add column if not exists reversed_at timestamptz;

-- Estorna (ou reativa) um recebimento. Exige perfil admin, registra auditoria e
-- recalcula as métricas da ordem (o palete estornado deixa de contar no saldo).
create or replace function public.set_receipt_valid(
  p_receipt_id bigint,
  p_valid boolean,
  p_motivo text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur boolean;
  v_ord text;
  v_doc text;
begin
  if public.current_user_role() <> 'admin' then
    return 'Apenas administradores podem estornar recebimentos.';
  end if;
  select is_valid, production_order, document_number
    into v_cur, v_ord, v_doc
  from public.production_receipts where id = p_receipt_id;
  if v_cur is null then
    return 'Recebimento não encontrado.';
  end if;
  update public.production_receipts
  set is_valid = p_valid,
      reversal_reason = case when p_valid then null else coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Estorno manual') end,
      reversed_at = case when p_valid then null else now() end,
      updated_at = now()
  where id = p_receipt_id;
  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(),
          case when p_valid then 'reativar_recebimento' else 'estornar_recebimento' end,
          'production_receipts', p_receipt_id::text,
          jsonb_build_object('is_valid', v_cur, 'document_number', v_doc, 'production_order', v_ord),
          jsonb_build_object('is_valid', p_valid, 'reversal_reason', p_motivo));
  perform public.refresh_order_metrics();
  return 'ok';
end;
$$;

-- DLOPES (operador 6) trabalha no horário administrativo (08:00-16:30).
-- Estende a alocação ADM dele para cobrir todo o histórico de tarefas.
update public.operator_shift_history
set start_date = '2026-08-01'::date
where id = 28;

-- Reprocessa a classificação com a função otimizada (set-based).
select public.reprocess_shift_classification();

-- ############################################################
-- migration_20260911_172017000
-- ############################################################
-- Perfis (roles) do sistema com permissões granulares. O perfil Administrador
-- é o único de sistema (ponto de partida); os demais são criados a partir dele.
create table public.user_roles (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  description text,
  role public.user_role not null default 'operator',
  permissions jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_roles_set_updated_at
  before update on public.user_roles for each row execute function public.set_updated_at();
alter table public.user_roles enable row level security;
create policy "user_roles_select" on public.user_roles for select
  using (public.current_user_role() in ('admin','manager','operator'));
create policy "user_roles_write" on public.user_roles for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

-- Perfil padrão: somente Administrador (sistema). Novos perfis clonam as permissões dele.
insert into public.user_roles (code, name, description, role, permissions, is_system)
values ('admin', 'Administrador', 'Acesso total ao sistema', 'admin',
  '["dashboard","orders","import","performance","operators","shifts","schedules","settings","audit","users","roles","orders:reversal","shifts:reprocess"]'::jsonb, true);

-- Vincula cada usuário ao seu perfil.
alter table public.profiles add column role_id bigint references public.user_roles(id);
alter table public.profiles add column active boolean not null default true;

-- Backfill: usuários existentes recebem o perfil correspondente (admin p/ admin,
-- senão cria um perfil padrão com o mesmo papel).
insert into public.user_roles (code, name, description, role, permissions, is_system)
select 'manager', 'Gerente', 'Criado automaticamente', 'manager',
  '["dashboard","orders","performance","audit"]'::jsonb, false
where not exists (select 1 from public.user_roles where code = 'manager');
insert into public.user_roles (code, name, description, role, permissions, is_system)
select 'operator', 'Operador', 'Criado automaticamente', 'operator',
  '["dashboard","orders"]'::jsonb, false
where not exists (select 1 from public.user_roles where code = 'operator');

update public.profiles p
set role_id = (select id from public.user_roles r where r.code = p.role::text);

-- Permissões do usuário logado (segurança definer, evita recursão de RLS).
create or replace function public.current_user_permissions()
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(r.permissions))
     from public.user_roles r
     join public.profiles p on p.role_id = r.id
     where p.id = auth.uid()),
    '{}'::text[]
  );
$$;

-- Nome do perfil do usuário logado.
create or replace function public.current_user_role_name()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select r.name from public.user_roles r
  join public.profiles p on p.role_id = r.id
  where p.id = auth.uid();
$$;

-- Impede que um usuário comum altere o próprio perfil/papel (escalonamento).
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id = auth.uid() and public.current_user_role() <> 'admin' then
    if new.role is distinct from old.role or new.role_id is distinct from old.role_id
       or new.active is distinct from old.active then
      raise exception 'O próprio usuário não pode alterar o perfil, papel ou status.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Auditoria de alterações em perfis e usuários.
drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.log_master_data_change();

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.log_master_data_change();

-- ############################################################
-- migration_20260911_172537000
-- ############################################################
-- Protege o perfil de sistema (Administrador): não pode ser alterado, desativado ou excluído.
create or replace function public.protect_system_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_system then
    if tg_op = 'DELETE' then
      raise exception 'O perfil de sistema (Administrador) não pode ser excluído.';
    end if;
    if new.name is distinct from old.name
       or new.description is distinct from old.description
       or new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.active is distinct from old.active
       or new.code is distinct from old.code then
      raise exception 'O perfil de sistema (Administrador) não pode ser alterado.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_protect_system on public.user_roles;
create trigger user_roles_protect_system
  before update or delete on public.user_roles
  for each row execute function public.protect_system_role();

-- ############################################################
-- migration_20260912_033709000
-- ############################################################
-- Classificação em duas etapas:
-- 1) SEMPRE vincula o operador quando autor/confirmado por casa com um operador
--    registrado (independe da janela de horário) -> os totais por operador
--    passam a bater com o relatório real (SAP).
-- 2) Atribui o turno apenas quando a data/hora da tarefa cai na janela do turno
--    da alocação vigente do operador.
create or replace function public.classify_warehouse_task_shifts()
returns void
language sql
security definer
set search_path = public
as $$
  -- (1a) Operador de puxada (1020) sempre que o autor casar com um operador.
  update public.warehouse_tasks t
  set pull_operator_id = m.operator_id
  from (
    select t2.id as task_id, o.id as operator_id
    from public.warehouse_tasks t2
    join public.operators o
      on (o.name = trim(coalesce(t2.author,'')) or o.employee_number = trim(coalesce(t2.author,'')))
    where t2.process_type = '1020'
  ) m
  where t.id = m.task_id;

  -- (1b) Operador de armazenagem (1012) sempre que o confirmado por casar.
  update public.warehouse_tasks t
  set storage_operator_id = m.operator_id
  from (
    select t2.id as task_id, o.id as operator_id
    from public.warehouse_tasks t2
    join public.operators o
      on (o.name = trim(coalesce(t2.confirmed_by,'')) or o.employee_number = trim(coalesce(t2.confirmed_by,'')))
    where t2.process_type = '1012'
  ) m
  where t.id = m.task_id;

  -- (2a) Turno da puxada: somente quando a hora cair na janela do turno.
  update public.warehouse_tasks t
  set pull_shift_id = m.shift_id,
      operational_pull_day = m.operational_day
  from (
    select t2.id as task_id, o.id as operator_id, g.shift_id, g.operational_day
    from public.warehouse_tasks t2
    join public.operators o
      on (o.name = trim(coalesce(t2.author,'')) or o.employee_number = trim(coalesce(t2.author,'')))
    cross join lateral public.get_shift_for_datetime(o.id, (t2.creation_date + t2.creation_time)::timestamp) g
    where t2.process_type = '1020'
      and t2.creation_date is not null and t2.creation_time is not null
      and g.shift_id is not null
  ) m
  where t.id = m.task_id;

  -- (2b) Turno da armazenagem.
  update public.warehouse_tasks t
  set storage_shift_id = m.shift_id,
      operational_storage_day = m.operational_day
  from (
    select t2.id as task_id, o.id as operator_id, g.shift_id, g.operational_day
    from public.warehouse_tasks t2
    join public.operators o
      on (o.name = trim(coalesce(t2.confirmed_by,'')) or o.employee_number = trim(coalesce(t2.confirmed_by,'')))
    cross join lateral public.get_shift_for_datetime(o.id, (t2.confirmation_date + t2.confirmation_time)::timestamp) g
    where t2.process_type = '1012'
      and t2.confirmation_date is not null and t2.confirmation_time is not null
      and g.shift_id is not null
  ) m
  where t.id = m.task_id;
$$;

select public.reprocess_shift_classification();

-- ############################################################
-- migration_20260913_001302000
-- ############################################################
-- reprocess_shift_classification: UPDATE sem WHERE é bloqueado pelo PostgREST
-- (erro "UPDATE requires a WHERE clause"). Adiciona WHERE true para satisfazer
-- a regra de segurança sem mudar o comportamento.
create or replace function public.reprocess_shift_classification()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.warehouse_tasks
  set pull_operator_id = null,
      storage_operator_id = null,
      pull_shift_id = null,
      storage_shift_id = null,
      operational_pull_day = null,
      operational_storage_day = null
  where true;
  perform public.classify_warehouse_task_shifts();
end;
$$;

-- ############################################################
-- migration_20260913_001327000
-- ############################################################
-- Reset de todas as alocações de turno (operador x turno) para o usuário
-- reconfigurar do zero. Mantém a auditoria do que foi apagado.
delete from public.operator_shift_history;

-- Limpa a classificação de turno e reprocessa: sem alocações, nenhuma tarefa
-- recebe turno (operador continua vinculado pelo nome).
select public.reprocess_shift_classification();

-- ############################################################
-- migration_20260913_011555000
-- ############################################################
-- Vincula tarefas de depósito (1020/1012) à ordem de produção quando a tarefa
-- não traz a ordem, comparando material + lote com ordens que possuem UM ÚNICO
-- lote para aquele material (ex.: ordem 10017004 / material 3000000215 / lote
-- 0000022148). Combinações ambíguas (mais de uma ordem para o mesmo material+lote)
-- ficam sem vínculo para não errar.
create or replace function public.link_tasks_to_orders()
returns void
language sql
security definer
set search_path = public
as $$
  with unica_ordem as (
    select material_code, lot, min(order_number) as order_number
    from public.production_orders
    where lot is not null and material_code is not null
    group by material_code, lot
    having count(*) = 1
  )
  update public.warehouse_tasks t
  set production_order = u.order_number
  from unica_ordem u
  where (t.production_order is null or t.production_order = '')
    and t.material_code = u.material_code
    and t.lot = u.lot;
$$;

select public.link_tasks_to_orders();

-- ############################################################
-- migration_20260913_063622000
-- ############################################################
-- Ordem só é considerada Finalizada quando a puxada atingiu o exigido E a
-- armazenagem foi concluída (nenhuma tarefa de puxada 1020 em aberto/espera).
-- Tarefas estornadas (A) não contam como pendentes.
create or replace view public.production_order_metrics as
with basis as (
  select coalesce((select value from public.system_settings where key = 'pull_completion_basis')::text, 'confirmed') as pull_basis
),
order_base as (
  select
    po.id,
    po.order_number,
    po.material_code,
    po.material_description,
    po.unit,
    po.lot,
    po.planned_quantity,
    po.confirmed_quantity,
    po.sap_supplied_quantity,
    po.actual_start,
    po.actual_end,
    po.planned_start,
    po.created_date,
    case
      when b.pull_basis = 'planned' then po.planned_quantity
      when b.pull_basis = 'min' then least(coalesce(po.planned_quantity,0), coalesce(po.confirmed_quantity,0))
      else coalesce(nullif(coalesce(po.confirmed_quantity,0),0), po.planned_quantity)
    end as required_quantity
  from public.production_orders po
  cross join basis b
),
pulled as (
  select
    production_order,
    coalesce(sum(quantity),0) as pulled_quantity,
    count(*) as receipt_count
  from public.production_receipts
  where is_valid
  group by production_order
),
pull_times as (
  select
    production_order,
    min(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as first_pull_at,
    max(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as last_pull_at
  from public.warehouse_tasks
  where process_type = '1020'
    and task_status is distinct from 'A'
  group by production_order
),
open_pulls as (
  select
    production_order,
    count(*) as open_count
  from public.warehouse_tasks
  where process_type = '1020'
    and task_status is distinct from 'A'
    and coalesce(task_status, '') <> 'C'
  group by production_order
)
select
  ob.id,
  ob.order_number,
  ob.material_code,
  ob.material_description,
  ob.unit,
  ob.lot,
  ob.planned_quantity,
  ob.confirmed_quantity,
  ob.sap_supplied_quantity,
  ob.required_quantity,
  coalesce(p.pulled_quantity,0) as pulled_quantity,
  greatest(coalesce(ob.required_quantity,0) - coalesce(p.pulled_quantity,0), 0) as balance_quantity,
  greatest(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0), 0) as excess_quantity,
  case
    when coalesce(ob.required_quantity,0) > 0
    then least(100, round(coalesce(p.pulled_quantity,0) / ob.required_quantity * 100, 2))
    else 0
  end as pull_efficiency_percent,
  case
    when coalesce(p.pulled_quantity,0) = 0 then 'not_started'
    when coalesce(p.pulled_quantity,0) < coalesce(ob.required_quantity,0) then 'in_progress'
    when coalesce(p.pulled_quantity,0) > coalesce(ob.required_quantity,0) then 'excess'
    when coalesce(op.open_count,0) > 0 then 'in_progress'
    else 'completed'
  end::public.order_status as status,
  ob.actual_start,
  ob.actual_end,
  ob.planned_start,
  ob.created_date,
  pt.first_pull_at,
  pt.last_pull_at,
  coalesce(op.open_count,0) as open_task_count
from order_base ob
left join pulled p on p.production_order = ob.order_number
left join pull_times pt on pt.production_order = ob.order_number
left join open_pulls op on op.production_order = ob.order_number;

-- ############################################################
-- migration_20260913_071051000
-- ############################################################
-- Normalização de saldo/divergência: quando o analista analisa uma ordem e
-- confirma que o excesso ou a falta de saldo SAP é aceitável (ex.: palete
-- devolvido/estornado), o sistema passa a ignorar esse excesso/falta e trata a
-- ordem conforme o saldo real normalizado.
alter table public.production_orders
  add column if not exists normalized_saldo boolean not null default false,
  add column if not exists normalized_reason text,
  add column if not exists normalized_at timestamptz;

-- Auditoria de normalização (reutiliza o trigger de auditoria de perfis? não,
-- usa o de dados mestre não se aplica a production_orders) — registra manualmente.
create or replace function public.log_order_normalization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.normalized_saldo is distinct from old.normalized_saldo or
     new.normalized_reason is distinct from old.normalized_reason then
    insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
    values (auth.uid(),
            case when new.normalized_saldo then 'normalizar_saldo' else 'desnormalizar_saldo' end,
            'production_orders', new.order_number,
            jsonb_build_object('normalized_saldo', old.normalized_saldo, 'normalized_reason', old.normalized_reason),
            jsonb_build_object('normalized_saldo', new.normalized_saldo, 'normalized_reason', new.normalized_reason));
  end if;
  return new;
end;
$$;

create trigger production_orders_normalization_audit
  after update on public.production_orders
  for each row execute function public.log_order_normalization();

-- ############################################################
-- migration_20260913_071104000
-- ############################################################
-- production_order_metrics: quando a ordem tem normalized_saldo = true
-- (analista analisou e aceitou a divergência de saldo SAP × físico),
-- o saldo e o excesso são tratados como 0 e o status segue o que foi
-- efetivamente puxado, sem o excedente/falta de saldo.
create or replace view public.production_order_metrics as
with basis as (
  select coalesce((select value from public.system_settings where key = 'pull_completion_basis')::text, 'confirmed') as pull_basis
),
order_base as (
  select
    po.id,
    po.order_number,
    po.material_code,
    po.material_description,
    po.unit,
    po.lot,
    po.planned_quantity,
    po.confirmed_quantity,
    po.sap_supplied_quantity,
    po.actual_start,
    po.actual_end,
    po.planned_start,
    po.created_date,
    coalesce(po.normalized_saldo, false) as normalized_saldo,
    po.normalized_reason,
    po.normalized_at,
    case
      when b.pull_basis = 'planned' then po.planned_quantity
      when b.pull_basis = 'min' then least(coalesce(po.planned_quantity,0), coalesce(po.confirmed_quantity,0))
      else coalesce(nullif(coalesce(po.confirmed_quantity,0),0), po.planned_quantity)
    end as required_quantity
  from public.production_orders po
  cross join basis b
),
pulled as (
  select
    production_order,
    coalesce(sum(quantity),0) as pulled_quantity,
    count(*) as receipt_count
  from public.production_receipts
  where is_valid
  group by production_order
),
pull_times as (
  select
    production_order,
    min(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as first_pull_at,
    max(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as last_pull_at
  from public.warehouse_tasks
  where process_type = '1020'
    and task_status is distinct from 'A'
  group by production_order
),
open_pulls as (
  select
    production_order,
    count(*) as open_count
  from public.warehouse_tasks
  where process_type = '1020'
    and task_status is distinct from 'A'
    and coalesce(task_status, '') <> 'C'
  group by production_order
)
select
  ob.id,
  ob.order_number,
  ob.material_code,
  ob.material_description,
  ob.unit,
  ob.lot,
  ob.planned_quantity,
  ob.confirmed_quantity,
  ob.sap_supplied_quantity,
  ob.required_quantity,
  coalesce(p.pulled_quantity,0) as pulled_quantity,
  -- Saldo: o que falta puxar vs o exigido. Se normalizado (analista aceitou
  -- a divergência), o saldo deixa de contar.
  case when ob.normalized_saldo then 0
       else greatest(coalesce(ob.required_quantity,0) - coalesce(p.pulled_quantity,0), 0)
  end as balance_quantity,
  -- Excesso: puxado acima do exigido. Idem.
  case when ob.normalized_saldo then 0
       else greatest(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0), 0)
  end as excess_quantity,
  case
    when coalesce(ob.required_quantity,0) > 0
    then least(100, round(coalesce(p.pulled_quantity,0) / ob.required_quantity * 100, 2))
    else 0
  end as pull_efficiency_percent,
  case
    when coalesce(p.pulled_quantity,0) = 0 then 'not_started'
    when coalesce(p.pulled_quantity,0) < coalesce(ob.required_quantity,0) then 'in_progress'
    when coalesce(p.pulled_quantity,0) > coalesce(ob.required_quantity,0) then 'excess'
    when coalesce(op.open_count,0) > 0 then 'in_progress'
    else 'completed'
  end::public.order_status as status,
  ob.actual_start,
  ob.actual_end,
  ob.planned_start,
  ob.created_date,
  pt.first_pull_at,
  pt.last_pull_at,
  coalesce(op.open_count,0) as open_task_count,
  ob.normalized_saldo,
  ob.normalized_reason,
  ob.normalized_at
from order_base ob
left join pulled p on p.production_order = ob.order_number
left join pull_times pt on pt.production_order = ob.order_number
left join open_pulls op on op.production_order = ob.order_number;

-- ############################################################
-- migration_20260913_073254000
-- ############################################################
-- Status: quando a ordem tem normalized_saldo = true (analista aceitou a
-- divergência SAP × físico), o excesso/falta de saldo é ignorado e a ordem
-- conta como concluída se o puxado atingiu o exigido e não há tarefa aberta.
create or replace view public.production_order_metrics as
with basis as (
  select coalesce((select value from public.system_settings where key = 'pull_completion_basis')::text, 'confirmed') as pull_basis
),
order_base as (
  select
    po.id, po.order_number, po.material_code, po.material_description,
    po.unit, po.lot, po.planned_quantity, po.confirmed_quantity,
    po.sap_supplied_quantity, po.actual_start, po.actual_end,
    po.planned_start, po.created_date,
    coalesce(po.normalized_saldo, false) as normalized_saldo,
    po.normalized_reason, po.normalized_at,
    case
      when b.pull_basis = 'planned' then po.planned_quantity
      when b.pull_basis = 'min' then least(coalesce(po.planned_quantity,0), coalesce(po.confirmed_quantity,0))
      else coalesce(nullif(coalesce(po.confirmed_quantity,0),0), po.planned_quantity)
    end as required_quantity
  from public.production_orders po
  cross join basis b
),
pulled as (
  select production_order, coalesce(sum(quantity),0) as pulled_quantity
  from public.production_receipts
  where is_valid
  group by production_order
),
pull_times as (
  select production_order,
    min(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as first_pull_at,
    max(case when creation_date is not null and creation_time is not null
        then (creation_date + creation_time)::timestamp end) as last_pull_at
  from public.warehouse_tasks
  where process_type = '1020' and task_status is distinct from 'A'
  group by production_order
),
open_pulls as (
  select production_order, count(*) as open_count
  from public.warehouse_tasks
  where process_type = '1020'
    and task_status is distinct from 'A'
    and coalesce(task_status, '') <> 'C'
  group by production_order
)
select
  ob.id, ob.order_number, ob.material_code, ob.material_description,
  ob.unit, ob.lot, ob.planned_quantity, ob.confirmed_quantity,
  ob.sap_supplied_quantity, ob.required_quantity,
  coalesce(p.pulled_quantity,0) as pulled_quantity,
  case when ob.normalized_saldo then 0
       else greatest(coalesce(ob.required_quantity,0) - coalesce(p.pulled_quantity,0), 0)
  end as balance_quantity,
  case when ob.normalized_saldo then 0
       else greatest(coalesce(p.pulled_quantity,0) - coalesce(ob.required_quantity,0), 0)
  end as excess_quantity,
  case
    when coalesce(ob.required_quantity,0) > 0
    then least(100, round(coalesce(p.pulled_quantity,0) / ob.required_quantity * 100, 2))
    else 0
  end as pull_efficiency_percent,
  case
    -- Normalizado: analista aceitou a divergência de saldo; excesso/falta
    -- deixam de classificar a ordem. Conclui se puxou o exigido e não há
    -- tarefa de puxada em aberto.
    when ob.normalized_saldo and coalesce(p.pulled_quantity,0) = 0 then 'not_started'
    when ob.normalized_saldo and coalesce(op.open_count,0) > 0 then 'in_progress'
    when ob.normalized_saldo then 'completed'
    when coalesce(p.pulled_quantity,0) = 0 then 'not_started'
    when coalesce(p.pulled_quantity,0) < coalesce(ob.required_quantity,0) then 'in_progress'
    when coalesce(p.pulled_quantity,0) > coalesce(ob.required_quantity,0) then 'excess'
    when coalesce(op.open_count,0) > 0 then 'in_progress'
    else 'completed'
  end::public.order_status as status,
  ob.actual_start, ob.actual_end, ob.planned_start, ob.created_date,
  pt.first_pull_at, pt.last_pull_at,
  coalesce(op.open_count,0) as open_task_count,
  ob.normalized_saldo, ob.normalized_reason, ob.normalized_at
from order_base ob
left join pulled p on p.production_order = ob.order_number
left join pull_times pt on pt.production_order = ob.order_number
left join open_pulls op on op.production_order = ob.order_number;

-- ############################################################
-- migration_20260914_000001000
-- ############################################################
-- ============================================================
-- CONVERGE.AI — obrigar troca de senha no próximo login
-- ============================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Quando verdadeiro, o usuário precisa trocar a senha antes de usar o sistema.';


-- ############################################################
-- migration_20260914_190000000
-- ############################################################
-- ============================================================
-- CONVERGE.AI — permissões liberadas pelo painel (Perfis e Permissões)
-- ============================================================

-- "has_permission" permite que políticas de RLS e funções consultem a permissão
-- do usuário logado (admin tem sempre acesso total).
create or replace function public.has_permission(p_perm text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.user_roles r on r.id = p.role_id
    where p.id = auth.uid()
      and (p.role = 'admin' or (r.active and r.permissions ? p_perm))
  );
$$;

-- Importação de dados: liberada para quem tem a permissão "import".
drop policy if exists "imports_select" on public.imports;
create policy "imports_select" on public.imports for select
  using (public.current_user_role() in ('admin','manager') or public.has_permission('import'));

drop policy if exists "imports_write" on public.imports;
create policy "imports_write" on public.imports for all
  using (public.current_user_role() = 'admin' or public.has_permission('import'))
  with check (public.current_user_role() = 'admin' or public.has_permission('import'));

-- Estorno feito pelo painel fica vinculado à UC (tarefa 1020) do mesmo palete.
alter table public.warehouse_tasks
  add column if not exists reversal_reason text,
  add column if not exists reversed_at timestamptz;

-- Estorno/reativação de recebimento: liberado para quem tem "orders:reversal" e
-- registra a auditoria, recalcula as métricas e marca a UC correspondente.
create or replace function public.set_receipt_valid(
  p_receipt_id bigint,
  p_valid boolean,
  p_motivo text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur boolean;
  v_ord text;
  v_doc text;
  v_mat text;
  v_lot text;
  v_qty numeric;
begin
  if public.current_user_role() <> 'admin' and not public.has_permission('orders:reversal') then
    return 'Seu perfil não tem permissão para estornar recebimentos.';
  end if;
  select is_valid, production_order, document_number, material_code, lot, quantity
    into v_cur, v_ord, v_doc, v_mat, v_lot, v_qty
  from public.production_receipts where id = p_receipt_id;
  if v_cur is null then
    return 'Recebimento não encontrado.';
  end if;
  update public.production_receipts
  set is_valid = p_valid,
      reversal_reason = case when p_valid then null else coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Estorno manual') end,
      reversed_at = case when p_valid then null else now() end,
      updated_at = now()
  where id = p_receipt_id;
  -- Vincula o estorno à UC (tarefa 1020) do mesmo palete da ordem.
  update public.warehouse_tasks
  set reversal_reason = case when p_valid then null else coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Estorno manual') end,
      reversed_at = case when p_valid then null else now() end,
      updated_at = now()
  where process_type = '1020'
    and task_status is distinct from 'A'
    and production_order = v_ord
    and material_code is not distinct from v_mat
    and lot is not distinct from v_lot
    and quantity = v_qty;
  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(),
          case when p_valid then 'reativar_recebimento' else 'estornar_recebimento' end,
          'production_receipts', p_receipt_id::text,
          jsonb_build_object('is_valid', v_cur, 'document_number', v_doc, 'production_order', v_ord),
          jsonb_build_object('is_valid', p_valid, 'reversal_reason', p_motivo));
  perform public.refresh_order_metrics();
  return 'ok';
end;
$$;

-- Normalização de saldo: liberada para quem tem "orders:normalize". A função
-- altera somente as colunas de normalização (sem abrir escrita geral na tabela).
create or replace function public.normalize_order_saldo(
  p_order_number text,
  p_reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur boolean;
begin
  if public.current_user_role() <> 'admin' and not public.has_permission('orders:normalize') then
    return 'Seu perfil não tem permissão para normalizar saldo.';
  end if;
  select normalized_saldo into v_cur
  from public.production_orders where order_number = p_order_number;
  if v_cur is null then
    return 'Ordem não encontrada.';
  end if;
  update public.production_orders
  set normalized_saldo = not v_cur,
      normalized_reason = case when v_cur then null else coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Divergência analisada e aceita') end,
      normalized_at = case when v_cur then null else now() end,
      updated_at = now()
  where order_number = p_order_number;
  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(),
          case when v_cur then 'remover_normalizacao' else 'normalizar_saldo' end,
          'production_orders', p_order_number,
          jsonb_build_object('normalized_saldo', v_cur),
          jsonb_build_object('normalized_saldo', not v_cur, 'reason', p_reason));
  perform public.refresh_order_metrics();
  return 'ok';
end;
$$;


-- ############################################################
-- migration_20260914_212046000
-- ############################################################
-- ============================================================
-- CONVERGE.AI — permissões liberadas pelo painel (Perfis e Permissões)
-- ============================================================

create or replace function public.has_permission(p_perm text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.user_roles r on r.id = p.role_id
    where p.id = auth.uid()
      and (p.role = 'admin' or (r.active and r.permissions ? p_perm))
  );
$$;

drop policy if exists "imports_select" on public.imports;
create policy "imports_select" on public.imports for select
  using (public.current_user_role() in ('admin','manager') or public.has_permission('import'));

drop policy if exists "imports_write" on public.imports;
create policy "imports_write" on public.imports for all
  using (public.current_user_role() = 'admin' or public.has_permission('import'))
  with check (public.current_user_role() = 'admin' or public.has_permission('import'));

alter table public.warehouse_tasks
  add column if not exists reversal_reason text,
  add column if not exists reversed_at timestamptz;

create or replace function public.set_receipt_valid(
  p_receipt_id bigint,
  p_valid boolean,
  p_motivo text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur boolean;
  v_ord text;
  v_doc text;
  v_mat text;
  v_lot text;
  v_qty numeric;
begin
  if public.current_user_role() <> 'admin' and not public.has_permission('orders:reversal') then
    return 'Seu perfil não tem permissão para estornar recebimentos.';
  end if;
  select is_valid, production_order, document_number, material_code, lot, quantity
    into v_cur, v_ord, v_doc, v_mat, v_lot, v_qty
  from public.production_receipts where id = p_receipt_id;
  if v_cur is null then
    return 'Recebimento não encontrado.';
  end if;
  update public.production_receipts
  set is_valid = p_valid,
      reversal_reason = case when p_valid then null else coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Estorno manual') end,
      reversed_at = case when p_valid then null else now() end,
      updated_at = now()
  where id = p_receipt_id;
  update public.warehouse_tasks
  set reversal_reason = case when p_valid then null else coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Estorno manual') end,
      reversed_at = case when p_valid then null else now() end,
      updated_at = now()
  where process_type = '1020'
    and task_status is distinct from 'A'
    and production_order = v_ord
    and material_code is not distinct from v_mat
    and lot is not distinct from v_lot
    and quantity = v_qty;
  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(),
          case when p_valid then 'reativar_recebimento' else 'estornar_recebimento' end,
          'production_receipts', p_receipt_id::text,
          jsonb_build_object('is_valid', v_cur, 'document_number', v_doc, 'production_order', v_ord),
          jsonb_build_object('is_valid', p_valid, 'reversal_reason', p_motivo));
  perform public.refresh_order_metrics();
  return 'ok';
end;
$$;

create or replace function public.normalize_order_saldo(
  p_order_number text,
  p_reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur boolean;
begin
  if public.current_user_role() <> 'admin' and not public.has_permission('orders:normalize') then
    return 'Seu perfil não tem permissão para normalizar saldo.';
  end if;
  select normalized_saldo into v_cur
  from public.production_orders where order_number = p_order_number;
  if v_cur is null then
    return 'Ordem não encontrada.';
  end if;
  update public.production_orders
  set normalized_saldo = not v_cur,
      normalized_reason = case when v_cur then null else coalesce(nullif(trim(coalesce(p_reason,'')),''), 'Divergência analisada e aceita') end,
      normalized_at = case when v_cur then null else now() end,
      updated_at = now()
  where order_number = p_order_number;
  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(),
          case when v_cur then 'remover_normalizacao' else 'normalizar_saldo' end,
          'production_orders', p_order_number,
          jsonb_build_object('normalized_saldo', v_cur),
          jsonb_build_object('normalized_saldo', not v_cur, 'reason', p_reason));
  perform public.refresh_order_metrics();
  return 'ok';
end;
$$;

-- ############################################################
-- migration_20260914_235142000
-- ############################################################
-- ============================================================
-- CONVERGE.AI — Automação SAP: chaves de integração do robô
-- ============================================================

create table if not exists public.ingestion_tokens (
  id bigserial primary key,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_used_type text,
  use_count integer not null default 0
);

alter table public.ingestion_tokens enable row level security;

-- Somente administradores enxergam e gerenciam as chaves do robô.
create policy "ingestion_tokens_admin_all" on public.ingestion_tokens
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create index if not exists idx_ingestion_tokens_hash on public.ingestion_tokens(token_hash);

-- Distingue carga manual (planilha) de carga automática (robô SAP).
alter table public.imports
  add column if not exists source text not null default 'manual';

comment on column public.imports.source is
  'Origem da carga: manual (planilha) ou auto (robô SAP).';

-- ############################################################
-- migration_20260915_010000000
-- ############################################################
-- ============================================================
-- CONVERGE.AI — PD destino no Pallets / UC da ordem (MON)
-- ============================================================

alter table public.warehouse_tasks
  add column if not exists pd_destino text;

comment on column public.warehouse_tasks.pd_destino is
  'PD destino do palete — coluna "PD destino" do relatório MON (Puxada UC).';


-- ############################################################
-- migration_20260915_152342000
-- ############################################################
alter table public.warehouse_tasks
  add column if not exists pd_destino text;

comment on column public.warehouse_tasks.pd_destino is
  'PD destino do palete — coluna "PD destino" do relatório MON (Puxada UC).';

-- ############################################################
-- migration_20260915_160000000
-- ############################################################
-- ============================================================
-- CONVERGE.AI — corrige o vínculo do estorno à UC (Pallets / UC da ordem)
-- ============================================================
-- Antes, o estorno casava apenas por material + lote + quantidade, o que
-- replicava a marcação para vários paletes da mesma ordem (33 de 34 UCs).
-- Agora a UC é resolvida por material + lote + horários (puxada e armazenagem,
-- idênticos nos arquivos Recebimento e MON/Puxada UC, com tolerância de 2s).
-- Se isso for ambíguo, tenta material + lote + quantidade. Se continuar
-- ambíguo, nenhuma UC é marcada — nunca replica em massa.

-- Resolve QUAL UC (tarefa 1020) corresponde a um recebimento.
-- Retorna o id da tarefa, ou null quando não há correspondência única.
create or replace function public.resolve_receipt_task(p_receipt_id bigint)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  r record;
  v_id bigint;
  v_count bigint;
begin
  select * into r from public.production_receipts where id = p_receipt_id;
  if not found then
    return null;
  end if;

  -- 1) material + lote + horário de puxada (criação = EM) e de armazenagem
  --    (confirmação = entrada em depósito), com tolerância de 2 segundos.
  select count(*), min(t.id) into v_count, v_id
  from public.warehouse_tasks t
  where t.process_type = '1020'
    and t.task_status is distinct from 'A'
    and t.production_order = r.production_order
    and t.material_code is not distinct from r.material_code
    and t.lot is not distinct from r.lot
    and t.creation_date is not distinct from r.goods_receipt_date
    and t.confirmation_date is not distinct from r.storage_date
    and abs(extract(epoch from (t.creation_time - r.goods_receipt_time))) <= 2
    and abs(extract(epoch from (t.confirmation_time - r.storage_time))) <= 2;
  if v_count = 1 then
    return v_id;
  end if;

  -- 2) material + lote + quantidade (somente quando resolve para uma única UC)
  select count(*), min(t.id) into v_count, v_id
  from public.warehouse_tasks t
  where t.process_type = '1020'
    and t.task_status is distinct from 'A'
    and t.production_order = r.production_order
    and t.material_code is not distinct from r.material_code
    and t.lot is not distinct from r.lot
    and t.quantity = r.quantity;
  if v_count = 1 then
    return v_id;
  end if;

  -- 3) ambíguo ou sem correspondência: não marca nenhuma UC.
  return null;
end;
$$;

-- Estorno/reativação de recebimento (mantém permissão, auditoria e métricas).
create or replace function public.set_receipt_valid(
  p_receipt_id bigint,
  p_valid boolean,
  p_motivo text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur boolean;
  v_ord text;
  v_doc text;
  v_reason text;
  v_task_id bigint;
begin
  if public.current_user_role() <> 'admin' and not public.has_permission('orders:reversal') then
    return 'Seu perfil não tem permissão para estornar recebimentos.';
  end if;

  select is_valid, production_order, document_number
    into v_cur, v_ord, v_doc
  from public.production_receipts where id = p_receipt_id;
  if v_cur is null then
    return 'Recebimento não encontrado.';
  end if;

  v_reason := coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Estorno manual');

  update public.production_receipts
  set is_valid = p_valid,
      reversal_reason = case when p_valid then null else v_reason end,
      reversed_at = case when p_valid then null else now() end,
      updated_at = now()
  where id = p_receipt_id;

  -- Vincula (ou desvincula) o estorno à UC do mesmo palete.
  v_task_id := public.resolve_receipt_task(p_receipt_id);
  if v_task_id is not null then
    update public.warehouse_tasks
    set reversal_reason = case when p_valid then null else v_reason end,
        reversed_at = case when p_valid then null else now() end,
        updated_at = now()
    where id = v_task_id;
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(),
          case when p_valid then 'reativar_recebimento' else 'estornar_recebimento' end,
          'production_receipts', p_receipt_id::text,
          jsonb_build_object('is_valid', v_cur, 'document_number', v_doc, 'production_order', v_ord),
          jsonb_build_object('is_valid', p_valid, 'reversal_reason', p_motivo, 'uc_task_id', v_task_id));
  perform public.refresh_order_metrics();
  return 'ok';
end;
$$;

-- ============================================================
-- Corrige as marcações feitas pela regra antiga (replicava em massa).
-- ============================================================

-- 1) Limpa todas as marcações de estorno das UCs.
update public.warehouse_tasks
set reversal_reason = null,
    reversed_at = null,
    updated_at = now()
where process_type = '1020'
  and reversed_at is not null;

-- 2) Remarca somente a UC correspondente a cada recebimento estornado.
update public.warehouse_tasks t
set reversal_reason = r.reversal_reason,
    reversed_at = r.reversed_at,
    updated_at = now()
from public.production_receipts r
where not r.is_valid
  and t.process_type = '1020'
  and public.resolve_receipt_task(r.id) = t.id;


-- ############################################################
-- migration_20260915_170000000
-- ############################################################
-- ============================================================
-- CONVERGE.AI — ajusta a resolução da UC do estorno
-- ============================================================
-- A hora de ARMazenagem (confirmação da tarefa = entrada em depósito do
-- recebimento) é a que sempre coincide entre os arquivos Recebimento e
-- MON/Puxada UC. A hora de puxada (criação da tarefa = EM) também coincide na
-- maioria, mas há exceções. Prioridade de resolução:
--   1) material + lote + horário de armazenagem (tolerância 2s)
--   2) material + lote + horário de puxada (tolerância 2s)
--   3) material + lote + quantidade
-- Sempre exigindo EXATAMENTE uma UC; senão, nenhuma é marcada (nunca replica).

create or replace function public.resolve_receipt_task(p_receipt_id bigint)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  r record;
  v_id bigint;
  v_count bigint;
begin
  select * into r from public.production_receipts where id = p_receipt_id;
  if not found then
    return null;
  end if;

  -- 1) material + lote + armazenagem (confirmação = entrada em depósito)
  select count(*), min(t.id) into v_count, v_id
  from public.warehouse_tasks t
  where t.process_type = '1020'
    and t.task_status is distinct from 'A'
    and t.production_order = r.production_order
    and t.material_code is not distinct from r.material_code
    and t.lot is not distinct from r.lot
    and t.confirmation_date is not distinct from r.storage_date
    and abs(extract(epoch from (t.confirmation_time - r.storage_time))) <= 2;
  if v_count = 1 then
    return v_id;
  end if;

  -- 2) material + lote + puxada (criação = EM)
  select count(*), min(t.id) into v_count, v_id
  from public.warehouse_tasks t
  where t.process_type = '1020'
    and t.task_status is distinct from 'A'
    and t.production_order = r.production_order
    and t.material_code is not distinct from r.material_code
    and t.lot is not distinct from r.lot
    and t.creation_date is not distinct from r.goods_receipt_date
    and abs(extract(epoch from (t.creation_time - r.goods_receipt_time))) <= 2;
  if v_count = 1 then
    return v_id;
  end if;

  -- 3) material + lote + quantidade (somente quando resolve para uma única UC)
  select count(*), min(t.id) into v_count, v_id
  from public.warehouse_tasks t
  where t.process_type = '1020'
    and t.task_status is distinct from 'A'
    and t.production_order = r.production_order
    and t.material_code is not distinct from r.material_code
    and t.lot is not distinct from r.lot
    and t.quantity = r.quantity;
  if v_count = 1 then
    return v_id;
  end if;

  -- 4) ambíguo ou sem correspondência: não marca nenhuma UC.
  return null;
end;
$$;

-- ============================================================
-- Reprocessa as marcações existentes com a regra atualizada.
-- ============================================================

update public.warehouse_tasks
set reversal_reason = null,
    reversed_at = null,
    updated_at = now()
where process_type = '1020'
  and reversed_at is not null;

update public.warehouse_tasks t
set reversal_reason = r.reversal_reason,
    reversed_at = r.reversed_at,
    updated_at = now()
from public.production_receipts r
where not r.is_valid
  and t.process_type = '1020'
  and public.resolve_receipt_task(r.id) = t.id;

