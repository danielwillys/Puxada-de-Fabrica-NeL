import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useShifts, useWorkSchedules, type WorkSchedule } from "@/lib/queries";

interface ScheduleForm {
  id?: number;
  name: string;
  description: string;
  shift_id: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  break_start: string;
  break_end: string;
  active: boolean;
}

const EMPTY_FORM: ScheduleForm = {
  name: "",
  description: "",
  shift_id: "",
  weekdays: [1, 2, 3, 4, 5],
  start_time: "06:00",
  end_time: "14:20",
  break_start: "",
  break_end: "",
  active: true,
};

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const hhmm = (value: string | null | undefined) => (value ? value.slice(0, 5) : "—");
const weekdayLabel = (value: number) =>
  WEEKDAYS.find((d) => d.value === value)?.label ?? String(value);

export function SchedulesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const schedules = useWorkSchedules();
  const shifts = useShifts();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);

  const shiftName = (id: number | null) =>
    (shifts.data ?? []).find((s) => s.id === id)?.code ?? "—";

  const save = useMutation({
    mutationFn: async (data: ScheduleForm) => {
      // One row per weekday keeps the model flexible for different day ranges.
      const base = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        shift_id: data.shift_id ? Number(data.shift_id) : null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        break_start: data.break_start || null,
        break_end: data.break_end || null,
        active: data.active,
      };
      if (data.id) {
        const { error } = await supabase
          .from("work_schedules")
          .update({ ...base, weekday: data.weekdays[0] ?? 1 })
          .eq("id", data.id);
        if (error) throw error;
        return;
      }
      const rows = data.weekdays.map((weekday) => ({ ...base, weekday }));
      const { error } = await supabase.from("work_schedules").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Escala salva.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["work-schedules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const openNew = () => {
    setForm({ ...EMPTY_FORM, shift_id: shifts.data?.[0] ? String(shifts.data[0].id) : "" });
    setOpen(true);
  };
  const openEdit = (s: WorkSchedule) => {
    setForm({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      shift_id: s.shift_id ? String(s.shift_id) : "",
      weekdays: [s.weekday],
      start_time: hhmm(s.start_time === "—" ? "" : s.start_time),
      end_time: hhmm(s.end_time === "—" ? "" : s.end_time),
      break_start: hhmm(s.break_start === "—" ? "" : s.break_start),
      break_end: hhmm(s.break_end === "—" ? "" : s.break_end),
      active: s.active,
    });
    setOpen(true);
  };

  const toggleWeekday = (value: number) =>
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(value)
        ? f.weekdays.filter((d) => d !== value)
        : [...f.weekdays, value].sort(),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Escalas</h1>
          <p className="text-sm text-muted-foreground">
            Escalas operacionais por turno, dias da semana e horários (configuráveis)
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={openNew} disabled={(shifts.data ?? []).length === 0}>
            <Plus className="h-4 w-4" />
            Nova escala
          </Button>
        ) : null}
      </div>

      {(shifts.data ?? []).length === 0 && !shifts.isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Cadastre ao menos um turno antes de criar escalas.
        </Card>
      ) : null}

      <Card className="p-4">
        {schedules.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escala</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Dia</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Intervalo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(schedules.data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{shiftName(s.shift_id)}</TableCell>
                    <TableCell>{weekdayLabel(s.weekday)}</TableCell>
                    <TableCell className="tabular-nums">{hhmm(s.start_time)}</TableCell>
                    <TableCell className="tabular-nums">{hhmm(s.end_time)}</TableCell>
                    <TableCell className="tabular-nums">
                      {s.break_start ? `${hhmm(s.break_start)} – ${hhmm(s.break_end)}` : "—"}
                    </TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge variant="success">Ativa</Badge>
                      ) : (
                        <Badge variant="neutral">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin ? (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(schedules.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nenhuma escala cadastrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar escala" : "Nova escala"}</DialogTitle>
            <DialogDescription>
              Ao criar, a escala é gravada para cada dia da semana selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Nome da escala</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Escala A"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Turno</Label>
              <Select
                value={form.shift_id || "none"}
                onValueChange={(v) => setForm({ ...form, shift_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(shifts.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => (
                  <Button
                    key={d.value}
                    type="button"
                    size="sm"
                    variant={form.weekdays.includes(d.value) ? "default" : "outline"}
                    onClick={() => toggleWeekday(d.value)}
                    disabled={Boolean(form.id) && form.weekdays.length === 1}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Horário inicial</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Horário final</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Início do intervalo</Label>
              <Input
                type="time"
                value={form.break_start}
                onChange={(e) => setForm({ ...form, break_start: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fim do intervalo</Label>
              <Input
                type="time"
                value={form.break_end}
                onChange={(e) => setForm({ ...form, break_end: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
              <Label>Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending || !form.name.trim() || form.weekdays.length === 0}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
