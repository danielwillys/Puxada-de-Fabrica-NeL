import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
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
import { useShifts } from "@/lib/queries";
import type { Shift } from "@/lib/types";

interface ShiftForm {
  id?: number;
  code: string;
  name: string;
  description: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  active: boolean;
}

const EMPTY_FORM: ShiftForm = {
  code: "",
  name: "",
  description: "",
  start_time: "06:00",
  end_time: "14:20",
  crosses_midnight: false,
  active: true,
};

const hhmm = (value: string | null | undefined) => (value ? value.slice(0, 5) : "—");

export function ShiftsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const shifts = useShifts();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);

  const save = useMutation({
    mutationFn: async (data: ShiftForm) => {
      const payload = {
        code: data.code.trim(),
        name: data.name.trim(),
        description: data.description.trim() || null,
        start_time: data.start_time,
        end_time: data.end_time,
        crosses_midnight: data.crosses_midnight,
        active: data.active,
      };
      const { error } = data.id
        ? await supabase.from("shifts").update(payload).eq("id", data.id)
        : await supabase.from("shifts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Turno salvo.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const reprocess = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("reprocess_shift_classification");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Classificação de turnos reprocessada.");
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao reprocessar."),
  });

  const openNew = () => {
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const openEdit = (s: Shift) => {
    setForm({
      id: s.id,
      code: s.code,
      name: s.name,
      description: s.description ?? "",
      start_time: hhmm(s.start_time),
      end_time: hhmm(s.end_time),
      crosses_midnight: s.crosses_midnight,
      active: s.active,
    });
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Turnos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro dos turnos da operação — horários configuráveis (sem valores fixos)
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <Button
              variant="outline"
              onClick={() => reprocess.mutate()}
              disabled={reprocess.isPending}
            >
              {reprocess.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Reprocessar classificação
            </Button>
          ) : null}
          {isAdmin ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Novo turno
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="p-4">
        {shifts.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Atravessa meia-noite</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(shifts.data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {s.description ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{hhmm(s.start_time)}</TableCell>
                    <TableCell className="tabular-nums">{hhmm(s.end_time)}</TableCell>
                    <TableCell>
                      {s.crosses_midnight ? (
                        <Badge variant="warning">Sim</Badge>
                      ) : (
                        <Badge variant="secondary">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="neutral">Inativo</Badge>
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
                {(shifts.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nenhum turno cadastrado. Cadastre os turnos da operação para habilitar as
                      análises por turno.
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
            <DialogTitle>{form.id ? "Editar turno" : "Novo turno"}</DialogTitle>
            <DialogDescription>
              Os horários são definidos por você — nenhum valor é fixo no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Código</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="T1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Turno 1"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Horário início</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Horário fim</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.crosses_midnight}
                onCheckedChange={(v) => setForm({ ...form, crosses_midnight: v })}
              />
              <Label>Atravessa meia-noite</Label>
            </div>
            <div className="flex items-center gap-3">
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
              disabled={save.isPending || !form.code.trim() || !form.name.trim()}
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
