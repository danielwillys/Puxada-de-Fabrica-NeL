import { RotateCcw } from "lucide-react";
import {
  PERIOD_OPTIONS,
  type GlobalFilters,
  useShifts,
} from "@/lib/queries";
import { ORDER_STATUS_OPTIONS } from "@/lib/types";
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
import { cn } from "@/lib/utils";

interface FilterBarProps {
  filters: GlobalFilters;
  onChange: (f: GlobalFilters) => void;
  className?: string;
  /** Mostra os filtros de turno e dia operacional (telas de performance). */
  showShiftFilters?: boolean;
}

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

export function FilterBar({ filters, onChange, className, showShiftFilters = false }: FilterBarProps) {
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
          onValueChange={(v) =>
            set({ period: v as GlobalFilters["period"] })
          }
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

      <Field label="Ordem">
        <Input
          className="h-9 w-[140px]"
          placeholder="Ex.: 1000123"
          value={filters.orderNumber}
          onChange={(e) => set({ orderNumber: e.target.value })}
        />
      </Field>

      <Field label="Material">
        <Input
          className="h-9 w-[140px]"
          placeholder="Código ou descrição"
          value={filters.material}
          onChange={(e) => set({ material: e.target.value })}
        />
      </Field>

      <Field label="Lote">
        <Input
          className="h-9 w-[120px]"
          placeholder="Lote"
          value={filters.lot}
          onChange={(e) => set({ lot: e.target.value })}
        />
      </Field>

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
            <SelectItem value="todos">Todos</SelectItem>
            {ORDER_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

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
          })
        }
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Limpar
      </Button>
    </div>
  );
}
