import { RotateCcw } from "lucide-react";
import {
  PERIOD_OPTIONS,
  type GlobalFilters,
  useShifts,
} from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  filters: GlobalFilters;
  onChange: (f: GlobalFilters) => void;
  className?: string;
  /** Mostra os filtros de turno e dia operacional (telas de performance). */
  showShiftFilters?: boolean;
  /** Mostra o filtro "somente ordens com tarefa em aberto" (tela de ordens). */
  showOpenTasks?: boolean;
}

const STATUS_OPTIONS: { value: GlobalFilters["status"]; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "not_started", label: "Não iniciada" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Finalizada" },
  { value: "divergence", label: "Divergência" },
];

const DIVERGENCE_TYPE_OPTIONS: {
  value: GlobalFilters["divergenceType"];
  label: string;
}[] = [
  { value: "all", label: "Qualquer divergência" },
  { value: "falta", label: "Falta puxar (não puxou todo o saldo)" },
  { value: "excesso", label: "Excesso (puxou mais que o exigido)" },
  { value: "sap", label: "Divergência SAP (Físico <> SAP)" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-[130px] flex-col gap-1">
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  className,
  showShiftFilters = false,
  showOpenTasks = false,
}: FilterBarProps) {
  const set = (patch: Partial<GlobalFilters>) => onChange({ ...filters, ...patch });
  const shifts = useShifts();

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3",
        className,
      )}
    >
      <Field label="Período">
        <Select
          value={filters.period}
          onValueChange={(v) => set({ period: v as GlobalFilters["period"] })}
        >
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="De">
        <Input
          type="date"
          className="h-9 w-[150px]"
          value={filters.startDate}
          disabled={filters.period !== "custom"}
          onChange={(e) => set({ startDate: e.target.value })}
        />
      </Field>

      <Field label="Até">
        <Input
          type="date"
          className="h-9 w-[150px]"
          value={filters.endDate}
          disabled={filters.period !== "custom"}
          onChange={(e) => set({ endDate: e.target.value })}
        />
      </Field>

      {showShiftFilters ? (
        <>
          <Field label="Turno">
            <Select
              value={filters.shiftId || "todos"}
              onValueChange={(v) =>
                set({ shiftId: v === "todos" ? "" : v })
              }
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Todos os turnos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os turnos</SelectItem>
                {(shifts.data ?? [])
                  .filter((s) => s.active)
                  .map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Dia operacional">
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={filters.operationalDay}
              onChange={(e) => set({ operationalDay: e.target.value })}
            />
          </Field>
        </>
      ) : null}

      <Field label="Status">
        <Select
          value={filters.status || "todos"}
          onValueChange={(v) =>
            set({ status: v === "todos" ? "" : (v as GlobalFilters["status"]) })
          }
        >
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {filters.status === "divergence" ? (
        <Field label="Tipo de divergência">
          <Select
            value={filters.divergenceType || "all"}
            onValueChange={(v) =>
              set({ divergenceType: v as GlobalFilters["divergenceType"] })
            }
          >
            <SelectTrigger className="h-9 w-[260px]">
              <SelectValue placeholder="Qualquer divergência" />
            </SelectTrigger>
            <SelectContent>
              {DIVERGENCE_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {showOpenTasks ? (
        <Field label="Tarefa em aberto">
          <div className="flex h-9 items-center gap-2 rounded-md border px-3">
            <Switch
              checked={filters.openTasksOnly}
              onCheckedChange={(v) => set({ openTasksOnly: v })}
            />
            <span className="text-xs text-muted-foreground">Só com tarefa em aberto</span>
          </div>
        </Field>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() =>
          onChange({
            period: "30d",
            startDate: "",
            endDate: "",
            orderNumber: "",
            material: "",
            lot: "",
            status: "",
            shiftId: "",
            operationalDay: "",
            divergence: "",
            divergenceType: "",
            openTasksOnly: false,
          })
        }
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Limpar
      </Button>
    </div>
  );
}
