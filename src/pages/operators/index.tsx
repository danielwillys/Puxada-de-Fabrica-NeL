import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2, Pencil, Plus, Users } from "lucide-react";
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
import {
  useOperatorShiftHistory,
  useOperators,
  useShifts,
} from "@/lib/queries";
import type { Operator } from "@/lib/types";
import { fmtDate, toLocalDateString } from "@/lib/format";

interface OperatorForm {
  id?: number;
  employee_number: string;
  name: string;
  role: string;
  active: boolean;
}

interface AllocationForm {
  operatorId: number;
  operatorName: string;
  shift_id: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FORM: OperatorForm = {
  employee_number: "",
  name: "",
  role: "",
  active: true,
};

const today = () => toLocalDateString(new Date());

export function OperatorsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const operators = useOperators();
  const shifts = useShifts();
  const history = useOperatorShiftHistory();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OperatorForm>(EMPTY_FORM);
  const [alloc, setAlloc] = useState<AllocationForm | null>(null);

  const shiftLabel = (id: number | null) => {
    const s = (shifts.data ?? []).find((x) => x.id === id);
    return s ? `${s.code} — ${s.name}` : "—";
  };

  /** Allocation covering today for an operator. */
  const currentShift = (operatorId: number) => {
    const ref = today();
    return (history.data ?? []).find(
      (h) =>
        h.operator_id === operatorId &&
        h.active &&
        h.start_date <= ref &&
        (!h.end_date || h.end_date >= ref),
    );
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["operators"] });
    qc.invalidateQueries({ queryKey: ["operator-shift-history"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const save = useMutation({
    mutationFn: async (data: OperatorForm) => {
      const payload = {
        employee_number: data.employee_number.trim(),
        name: data.name.trim(),
        role: data.role.trim() || null,
        active: data.active,
      };
      const { error } = data.id
        ? await supabase.from("operators").update(payload).eq("id", data.id)
        : await supabase.from("operators").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operador salvo.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const saveAllocation = useMutation({
    mutationFn: async (data: AllocationForm) => {
      const { error } = await supabase.from("operator_shift_history").insert({
        operator_id: data.operatorId,
        shift_id: data.shift_id ? Number(data.shift_id) : null,
        start_date: data.start_date,
        end_date: data.end_date || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alocação de turno registrada.");
      setAlloc(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a alocação."),
  });

  const openNew = () => {
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const openEdit = (o: Operator) => {
    setForm({
      id: o.id,
      employee_number: o.employee_number,
      name: o.name,
      role: o.role ?? "",
      active: o.active,
    });
    setOpen(true);
  };
  const openAllocation = (o: Operator) => {
    setAlloc({
      operatorId: o.id,
      operatorName: o.name,
      shift_id: shifts.data?.[0] ? String(shifts.data[0].id) : "",
      start_date: today(),
      end_date: "",
    });
  };

  const recentAllocations = (history.data ?? []).slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operadores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de operadores e alocação de turno com histórico (o turno pode mudar ao longo
            do tempo)
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Novo operador
          </Button>
        ) : null}
      </div>

      <Card className="p-4">
        {operators.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Turno atual</TableHead>
                  <TableHead>Início da alocação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(operators.data ?? []).map((o) => {
                  const current = currentShift(o.id);
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell>{o.employee_number}</TableCell>
                      <TableCell>{o.role ?? "—"}</TableCell>
                      <TableCell>
                        {current?.shift_id ? (
                          <Badge variant="info">{shiftLabel(current.shift_id)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Sem turno</span>
                        )}
                      </TableCell>
                      <TableCell>{current ? fmtDate(current.start_date) : "—"}</TableCell>
                      <TableCell>
                        {o.active ? (
                          <Badge variant="success">Ativo</Badge>
                        ) : (
                          <Badge variant="neutral">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Alocar turno"
                              onClick={() => openAllocation(o)}
                              disabled={(shifts.data ?? []).length === 0}
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              onClick={() => openEdit(o)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(operators.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum operador cadastrado.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> Histórico de alocação de turno
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operador</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAllocations.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>
                    {(operators.data ?? []).find((o) => o.id === h.operator_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell>{shiftLabel(h.shift_id)}</TableCell>
                  <TableCell>{fmtDate(h.start_date)}</TableCell>
                  <TableCell>{h.end_date ? fmtDate(h.end_date) : "—"}</TableCell>
                  <TableCell>
                    {h.active ? (
                      <Badge variant="secondary">Vigente</Badge>
                    ) : (
                      <Badge variant="neutral">Encerrada</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {recentAllocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhuma alocação registrada. Use "Alocar turno" para vincular um operador a um
                    turno a partir de uma data.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Operator form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar operador" : "Novo operador"}</DialogTitle>
            <DialogDescription>
              O turno é definido pela alocação (abaixo), preservando o histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Matrícula</Label>
              <Input
                value={form.employee_number}
                onChange={(e) => setForm({ ...form, employee_number: e.target.value })}
                placeholder="12345"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Função</Label>
              <Input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Operador de empilhadeira"
              />
            </div>
            <div className="flex items-center gap-3 self-end">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending || !form.name.trim() || !form.employee_number.trim()}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift allocation */}
      <Dialog open={Boolean(alloc)} onOpenChange={(o) => (o ? null : setAlloc(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alocar turno</DialogTitle>
            <DialogDescription>
              Operador: <strong>{alloc?.operatorName}</strong>. Períodos conflitantes são
              bloqueados pelo sistema.
            </DialogDescription>
          </DialogHeader>
          {alloc ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Turno</Label>
                <Select
                  value={alloc.shift_id || "none"}
                  onValueChange={(v) =>
                    setAlloc({ ...alloc, shift_id: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o turno" />
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
              <div className="flex flex-col gap-1.5">
                <Label>Data de início no turno</Label>
                <Input
                  type="date"
                  value={alloc.start_date}
                  onChange={(e) => setAlloc({ ...alloc, start_date: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Data de fim (opcional)</Label>
                <Input
                  type="date"
                  value={alloc.end_date}
                  onChange={(e) => setAlloc({ ...alloc, end_date: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlloc(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => alloc && saveAllocation.mutate(alloc)}
              disabled={saveAllocation.isPending || !alloc?.shift_id || !alloc?.start_date}
            >
              {saveAllocation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar alocação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
