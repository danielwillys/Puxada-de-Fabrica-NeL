import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useUserRoles } from "@/lib/queries";
import { PERMISSIONS, ROLE_LABEL, type Role, type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RoleForm {
  id?: number;
  name: string;
  description: string;
  role: Role;
  permissions: string[];
  active: boolean;
}

const EMPTY: RoleForm = {
  name: "",
  description: "",
  role: "operator",
  permissions: [],
  active: true,
};

/** Chaves de permissão por grupo, mantendo a ordem de exibição. */
const GROUPS = ["Módulos", "Administração", "Ações"] as const;

export function RolesPage() {
  const roles = useUserRoles();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RoleForm>(EMPTY);
  const [clonedFrom, setClonedFrom] = useState<UserRole | null>(null);

  useEffect(() => {
    if (!open && form.id !== undefined) setForm(EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["user-roles"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const save = useMutation({
    mutationFn: async (f: RoleForm) => {
      const payload = {
        name: f.name.trim(),
        description: f.description.trim() || null,
        role: f.role,
        permissions: f.permissions,
        active: f.active,
      };
      const { error } = f.id
        ? await supabase.from("user_roles").update(payload).eq("id", f.id)
        : await supabase
            .from("user_roles")
            .insert({
              ...payload,
              code:
                "perfil_" +
                f.name
                  .trim()
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]+/g, "_")
                  .replace(/^_+|_+$/g, "")
                  .slice(0, 40),
            });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil salvo.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const openNew = () => {
    // Novos perfis partem das permissões do perfil Administrador.
    const admin = (roles.data ?? []).find((r) => r.is_system);
    setClonedFrom(admin ?? null);
    setForm({
      ...EMPTY,
      role: "operator",
      permissions: admin ? [...admin.permissions] : [],
    });
    setOpen(true);
  };
  const openEdit = (r: UserRole) => {
    setClonedFrom(null);
    setForm({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      role: r.role,
      permissions: [...r.permissions],
      active: r.active,
    });
    setOpen(true);
  };

  const togglePerm = (key: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  };

  const rows = roles.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Perfis e permissões</h1>
          <p className="text-sm text-muted-foreground">
            O perfil Administrador é fixo. Novos perfis são criados a partir dele.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo perfil
        </Button>
      </div>

      <Card className="p-4">
        {roles.isLoading ? (
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
                  <TableHead>Perfil</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Papel base</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {r.name}
                        {r.is_system ? (
                          <ShieldCheck className="h-4 w-4 text-primary" />
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">
                      {r.description ?? "—"}
                    </TableCell>
                    <TableCell>{ROLE_LABEL(r.role)}</TableCell>
                    <TableCell>
                      <div className="flex max-w-[320px] flex-wrap gap-1">
                        {r.permissions.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nenhuma</span>
                        ) : (
                          r.permissions.slice(0, 4).map((p) => (
                            <Badge key={p} variant="secondary">
                              {PERMISSIONS.find((x) => x.key === p)?.label ?? p}
                            </Badge>
                          ))
                        )}
                        {r.permissions.length > 4 ? (
                          <Badge variant="outline">+{r.permissions.length - 4}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.active ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="neutral">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.is_system ? (
                        <span className="text-xs text-muted-foreground">Fixo</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar perfil"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhum perfil cadastrado.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar perfil" : "Novo perfil"}</DialogTitle>
            <DialogDescription>
              {!form.id && clonedFrom ? (
                <>
                  Criado a partir do perfil <strong>{clonedFrom.name}</strong> — ajuste as
                  permissões abaixo.
                </>
              ) : (
                "Configure nome, papel base e permissões de acesso."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Nome do perfil</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Supervisor de depósito"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Papel base (acesso no banco)</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-md border p-3">
              <p className="text-sm font-medium">Permissões</p>
              {GROUPS.map((group) => (
                <div key={group} className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {PERMISSIONS.filter((p) => p.group === group).map((p) => {
                      const on = form.permissions.includes(p.key);
                      return (
                        <label
                          key={p.key}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                            on
                              ? "border-primary bg-primary/5 text-foreground"
                              : "text-muted-foreground hover:bg-accent",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={on}
                            onChange={() => togglePerm(p.key)}
                          />
                          {p.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
              <Label>Perfil ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending || !form.name.trim()}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hint sobre o perfil administrador */}
      <Card className="p-4 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Copy className="h-4 w-4 text-primary" /> Como criar um novo perfil
        </p>
        <p className="mt-1">
          Clique em <strong>Novo perfil</strong>: as permissões começam iguais às do
          Administrador e você pode desmarcar o que não se aplica. O perfil Administrador
          não pode ser alterado ou removido.
        </p>
      </Card>
    </div>
  );
}
