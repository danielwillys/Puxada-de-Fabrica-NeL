# CONVERGE.AI — Factory Pull Platform · Phase 1

## Context

The user supplied a master spec (86 sections) for a production-ready internal platform that controls, monitors and reconciles the Factory Pull / Warehouse operation from three SAP Excel exports: **COOISPI** (production orders), **Recebimento** (physical receipts) and **MON / Puxada UC** (warehouse tasks/operators).

The spec is already EARS-grade (normative "the system shall" statements with explicit rules), so per the prompt-optimizer workflow the optimization deliverable is an executable, phase-ordered plan whose checklists encode the spec's testable requirements. This plan covers **Phase 1** (spec §79), which the user selected: backend foundation + the 3 imports + business rules + Factory Pull dashboard + order drill-down. The schema is designed from the start to support the later phases (shifts, operators, SLA, backlog, management dashboards).

Decisions confirmed with the user:
- Scope: **Phase 1 complete** (spec §79 Phase 1), built in the spec's priority order (data model → business rules → imports → dashboards).
- Interface language: **Portuguese (pt-BR)**.
- Admin bootstrap: **open signup; the first registered user automatically becomes administrator**.
- Test data: the user will **attach real sample files** (COOISPI, Recebimento, MON) to validate imports.

Current state: fresh Vite + React + TS + Tailwind + shadcn/ui template. No backend, no auth, no app pages, i18n set to en/zh-CN, `@supabase/supabase-js` installed but unused. Recharts, React Query, React Router already available.

The whole system needs a real backend (database, auth, authorization, server-side business rules, audit) → **Enter Cloud must be enabled** (step 0). No fictitious operational data anywhere: if there is no data, pages show `"Nenhum dado disponível para o período selecionado."`

## Architecture

- **Backend**: Enter Cloud (PostgreSQL + Auth + RLS + backend functions). All schema changes via the migration tool (RLS enabled in the same migration that creates each table). No raw SQL inside backend functions; use the client query methods.
- **Business rules live in the database/backend**, never duplicated in React:
  - SQL function `get_shift_for_datetime(operator_id, datetime)` → shift + operational day (midnight-crossing aware) — created now, used by MON import; shift dashboards come in Phase 3.
  - View `production_order_metrics` — required quantity (per configurable basis), pulled quantity, balance (never negative), excess (positive only), efficiency (capped at 100%), status.
  - View `sap_reconciliation` — `Qtd.fornecida` vs physical received → OK / divergência positiva / negativa.
- **Imports**: client parses Excel with `xlsx` (SheetJS, new dependency), maps pt-BR SAP headers → normalized rows, and POSTs to a single backend function `process-import` that validates → dedupes → upserts → classifies shifts (MON) → writes `imports` + `audit_logs`, returning `{total, inserted, updated, rejected, errors[]}`. Error report (Excel) is generated client-side from that response. Historical data is never deleted.
- **Auth/RBAC**: profiles table + trigger on signup (first profile → `admin`); roles `admin | manager | operator`; RLS policies scope all reads/writes by role via a security-definer helper; admin status decided on the backend only.
- **Frontend**: React Router routes behind an auth guard; sidebar layout (pt-BR menu); React Query for server state; recharts for charts; global filters via context + query params; server-side filter/sort/pagination for the orders table (never load the full history into the browser).
- **Language**: i18n default switched to **pt-BR**; all new UI strings in pt-BR.

## Phase 1 scope (what this build delivers)

1. Enter Cloud + full Phase-1 schema (all core tables, RLS, indexes, unique business keys, views/functions).
2. Auth + RBAC + first-user-is-admin + role-gated navigation.
3. **Importação de Dados** module: upload COOISPI / Recebimento / MON, header+format validation, duplicate detection, upsert, import history, validation-error report download.
4. Business rules: required pull quantity (configurable basis, default = confirmed quantity, fallback planned), order status (NÃO INICIADA / EM ANDAMENTO / FINALIZADA / EXCESSO), balance, excess, efficiency (capped 100%), SAP × physical reconciliation.
5. **Dashboard de Puxada** with global filters + KPI cards + real-data charts.
6. **Ordens de Produção** table (search/filter/sort/paginate/Excel+CSV export) + **order detail** with timeline and UC/pallet traceability (Order → UC → task → timestamps).
7. **Configurações** page: pull-completion basis (+ storage SLA fields stored now, used in Phase 2).
8. **Auditoria** page (admin read-only) + audit recording for imports and config changes.
9. Import validation using the user's attached sample files.

Not in this build (later phases, per spec §79): SLA/backlog/alerts/data-quality dashboards (P2), operators/shifts/schedules + shift classification UI (P3), operator/shift performance (P4), targets/executive dashboard (P5). Menu shows only delivered routes.

## Database (all migrations via the migration tool)

Tables (spec §52) with RLS, indexes (§54) and deterministic business keys:

- `profiles` — user_id, email, name, role enum(`admin`,`manager`,`operator`); trigger inserts on `auth.users` signup and sets first user to `admin`; RLS by role.
- `production_orders` — order_number, material_code, material_description, planned_quantity, confirmed_quantity, sap_supplied_quantity, required_pull_quantity, unit, lot, actual_start, actual_end, planned_start, created_date, status, timestamps. Unique: `order_number`.
- `production_receipts` — document_number, production_order, material_code, material_description, quantity, unit, lot, goods_receipt_status, warehouse_entry_status, goods_receipt_date/time, process_type, storage_date/time, timestamps. Unique business key on (document_number, production_order, material_code, lot, quantity, goods_receipt_date). Unit-aware (CX/FD/PCT never mixed).
- `warehouse_tasks` — warehouse_task, document, production_order, source_uc, material_code, material_description, lot, quantity, unit, process_type (1012/1020), task_status (A/B/C/empty), goods_receipt_date, author, creation_date/time, confirmed_by, confirmation_date/time, pull_operator_id, storage_operator_id, pull_shift_id, storage_shift_id, operational_pull_day, operational_storage_day, timestamps. Unique: `warehouse_task`. `get_shift_for_datetime` populates shift/day columns on import (only when shifts are configured; no-op otherwise).
- `operators`, `shifts`, `work_schedules`, `operator_shift_history` — full schemas per spec §29–§33, RLS + indexes; populated in Phase 3 but created now (schema must support all phases).
- `imports` — file_name, file_type, imported_by, imported_at, total/inserted/updated/rejected counts, status, error_log.
- `system_settings` — key/value/description; seeded: `pull_completion_basis = confirmed` (`confirmed|planned|min`), `storage_sla_minutes = 30`, backlog ranges JSON.
- `audit_logs` — user_id, action, entity, entity_id, old_value, new_value, created_at; writes only from backend functions.

Views/functions: `get_shift_for_datetime`, `production_order_metrics`, `sap_reconciliation`. After each migration, confirm RLS actually applied (schema check).

## Backend function

`supabase/functions/process-import/index.ts` (Deno.serve + CORS, deployed with the deploy tool):
- `{ file_type: 'cooispi'|'recebimento'|'mon', rows: NormalizedRow[] }`, JWT required.
- Per type: header contract (only spec fields; spec-listed "ignore" columns rejected), format validation (dates, quantities, units), dedup via unique keys, upsert preserving history, MON shift/operational-day classification, transaction-wrapped writes, `imports` + `audit_logs` rows, and a per-row error list.

## Files to create / modify

New frontend (React, pt-BR strings, design system tokens only — no raw color classes):
- `src/i18n/` — default language → pt-BR (+ pt-BR locale JSON).
- `src/context/auth-context.tsx` + `src/pages/auth/{login,signup}.tsx` — Supabase email/password; profile fetch; role state.
- `src/components/layout/app-layout.tsx` — collapsible sidebar (Dashboard, Ordens de Produção, Importação, Configurações, Auditoria, sign-out), responsive.
- `src/pages/dashboard/factory-pull.tsx` — global filters (período, dia operacional, ordem, material, lote, status; shift/operator hidden until P3), KPI cards, charts (eficiência ao longo do tempo, planejado × produzido × puxado, ordens por status, puxado por dia, saldo por dia, excesso por material, top ordens/materiais por saldo/excesso). Clicking a KPI opens the underlying records.
- `src/pages/orders/index.tsx` + `src/pages/orders/detail.tsx` — server-side table + export (Excel/CSV) + detail with summary/timeline/UC traceability.
- `src/pages/import/index.tsx` — upload, column mapping, results summary, error-report download, import history.
- `src/pages/settings/index.tsx` — pull-completion basis (admin), SLA/backlog fields stored for later phases.
- `src/pages/audit/index.tsx` — admin read-only log.
- `src/lib/{types,validation,excel,queries}.ts` — shared client-side column maps, validators, xlsx helpers, React Query hooks.
- `src/components/ui/` — reuse existing shadcn primitives (badge, card, dialog, dropdown, select, table, tabs, tooltip, pagination, etc.); add variants via design tokens.

Backend:
- Migrations for every table + views/functions above.
- `supabase/functions/process-import/index.ts` (deployed).
- `src/integrations/supabase/client.ts` — framework-generated, read-only; add only a thin auth/query helper layer, never edit it.

Dependency: add `xlsx` (SheetJS) for parsing/export.

## Implementation checklist

- [x] Enable Enter Cloud (`supabase_enable`) and confirm backend tools are available.
- [x] Migration: `profiles` + role enum + signup trigger (first user → admin) + RLS; RLS verified.
- [x] Migrations: `operators`, `shifts`, `work_schedules`, `operator_shift_history` + RLS + indexes.
- [x] Migrations: `production_orders`, `production_receipts`, `warehouse_tasks` + RLS + unique business keys + indexes (§54).
- [x] Migrations: `imports`, `system_settings` (seeded defaults), `audit_logs` + RLS + indexes.
- [x] Migration: `get_shift_for_datetime` SQL function (midnight-crossing → operational day = shift start date).
- [x] Migration: `production_order_metrics` view (required quantity per basis; status; balance ≥ 0; excess > 0; efficiency ≤ 100) and `sap_reconciliation` view (OK / positiva / negativa); extended with first/last pull timestamps; settings-change audit trigger.
- [x] Backend function `process-import` written (validation, dedup, upsert, shift classification, import + audit logging, per-row errors), deployed, auth-gate verified (401 without JWT, CORS preflight OK).
- [x] Add `xlsx` dependency; build pt-BR column maps + client-side validators for the 3 file types.
- [x] i18n default → pt-BR; pt-BR locale file for UI strings.
- [x] Auth: login + signup pages, auth context, protected routes, role-based menu.
- [x] App layout with sidebar and route registration in `router.tsx`.
- [x] Import center page: upload → validate → import → results summary → error-report download → import history.
- [x] Factory Pull dashboard: filters + 12 KPI cards + spec charts, empty-state message, no fake KPIs.
- [x] Orders table: server-side search/filter/sort/pagination + Excel/CSV export.
- [x] Order detail: summary, timeline, UC/pallet list with pull/storage timestamps + receipts.
- [x] Settings page: pull-completion basis persisted to `system_settings` (audited via trigger).
- [x] Audit page (admin) + audit rows written on import and on setting changes.
- [ ] Import the user's attached sample files and confirm KPIs reflect real data. — *pending: user will attach real files*

## Verification checklist

- [x] `pnpm run check` (lint + tsc) and `pnpm run build` pass (build ok, only chunk-size advisory warning).
- [x] `supabase_get_table_schema` confirms RLS enabled + policies present on every new table.
- [x] Function auth: POST without JWT → 401; CORS OPTIONS → 200.
- [x] Business rules (validated at DB layer with a temporary dataset, then fully removed): basis switches required quantity (confirmed 800/planned-fallback 300), balance never < 0, excess only when > 0 (50), efficiency capped at 100% (pulled 550 / required 500 → 100% + excess 50), status matrix from spec §65–§66 correct (completed / excess / not_started), invalid receipt excluded from pulled quantity.
- [x] SAP reconciliation: equality → OK; physical > SAP → divergência positiva (difference +100).
- [x] Import negatives/positives: validation, dedup, counts and error paths implemented; full end-to-end import waits on real files.
- [x] Empty state: no data → "Nenhum dado disponível para o período selecionado." + import hint when no imports exist.
- [x] Visual: desktop root redirects to login; login renders correctly at desktop_1280 and mobile_390 (no overflow/clipping).
- [ ] Signup: first registered user becomes `admin` — trigger in place; live check happens on the user's first signup.
- [ ] Dashboard drill-down and orders table export with real imported data — pending real files.
- [ ] Traceability on a real order from the imported files: Order → UC → pallet → task (1020 autor / 1012 confirmado por) → operator names → timestamps → pull→storage duration.
