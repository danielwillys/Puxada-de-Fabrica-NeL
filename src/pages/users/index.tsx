import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  UserRound,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminUsers, useUserRoles } from "@/lib/queries";
import type { UserAdminRow } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/types";

interface UserForm {
  id?: string;
  email: string;
  name: string;
  password: string;
  role_id: string;
}

const EMPTY_FORM: UserForm = { email: "", name: "", password: "", role_id: "" };

function invoke(action: string, payload: Record<string, unknown>) {
  return supabase.functions.invoke("manage-users", { body: { action, ...payload } });
}

async function getError(response: { error?: unknown; data?: unknown }): Promise<string> {
  const body = response.error as { message?: string } | undefined;
  return body?.message ?? "Não foi possível concluir a operação.";
}

export function UsersPage() {
  const { profile: me } = useAuth();
  const users = useAdminUsers();
  const roles = useUserRoles();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<UserAdminRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserAdminRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const createUser = useMutation({
    mutationFn: async (f: UserForm) => {
      const res = await invoke("create_user", {
        email: f.email,
        password: f.password,
        name: f.name,
        role_id: Number(f.role_id),
      });
      if (res.error) throw new Error(await getError(res));
    },
    onSuccess: () => {
      toast.success("Usuário criado.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível criar."),
  });

  const updateUser = useMutation({
    mutationFn: async (f: UserForm) => {
      const res = await invoke("update_user", {
        user_id: f.id,
        name: f.name,
        role_id: Number(f.role_id),
      });
      if (res.error) throw new Error(await getError(res));
    },
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  const setActive = useMutation({
    mutationFn: async (u: UserAdminRow) => {
      const res = await invoke("set_active", { user_id: u.id, active: !u.active });
      if (res.error) throw new Error(await getError(res));
    },
    onSuccess: () => {
      toast.success("Acesso atualizado.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  const resetPwd = useMutation({
    mutationFn: async () => {
      if (!resetTarget) return;
      const res = await invoke("reset_password", {
        user_id: resetTarget.id,
        password: resetPassword,
      });
      if (res.error) throw new Error(await getError(res));
    },
    onSuccess: () => {
      toast.success("Senha redefinida.");
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível redefinir."),
  });

  const openNew = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      role_id: roles.data?.find((r) => r.code === "operator")?.id
        ? String(roles.data.find((r) => r.code === "operator")!.id)
        : roles.data?.[0]
          ? String(roles.data[0].id)
          : "",
    });
    setOpen(true);
  };
  const openEdit = (u: UserAdminRow) => {
    setEditing(u);
    setForm({
      id: u.id,
      email: u.email,
      name: u.name,
      password: "",
      role_id: u.role_id ? String(u.role_id) : "",
    });
    setOpen(true);
  };

  const roleLabel = (id: number | null) => {
    const r = (roles.data ?? []).find((x) => x.id === id);
    return r ? r.name : "—";
  };

  const canEditSelf = me?.id;
  const rows = users.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de acessos — usuários são criados pela administração (cadastro público
            desativado)
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <Card className="p-4">
        {users.isLoading ? (
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
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="info">{roleLabel(u.role_id)}</Badge>
                    </TableCell>
                    <TableCell>{ROLE_LABEL(u.role)}</TableCell>
                    <TableCell>
                      {u.active ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="danger">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Redefinir senha"
                          onClick={() => setResetTarget(u)}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {u.id !== canEditSelf ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={u.active ? "Desativar" : "Ativar"}
                            onClick={() => setActive.mutate(u)}
                          >
                            {u.active ? (
                              <UserRoundX className="h-4 w-4 text-danger" />
                            ) : (
                              <UserRoundCheck className="h-4 w-4 text-success" />
                            )}
                          </Button>
                        ) : (
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Criar / editar usuário */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Altere nome e perfil. Para trocar a senha use a ação 'Redefinir senha'."
                : "O usuário passa a acessar o sistema com o e-mail e a senha informados."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                disabled={Boolean(editing)}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{editing ? "Senha (não alterada)" : "Senha inicial"}</Label>
              <Input
                type="password"
                value={form.password}
                disabled={Boolean(editing)}
                placeholder={editing ? "••••••••" : "Mínimo 6 caracteres"}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Perfil</Label>
              <Select
                value={form.role_id || "select"}
                onValueChange={(v) => setForm({ ...form, role_id: v === "select" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent>
                  {(roles.data ?? [])
                    .filter((r) => r.active)
                    .map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name} {r.is_system ? "(sistema)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                editing ? updateUser.mutate(form) : createUser.mutate(form)
              }
              disabled={
                createUser.isPending ||
                updateUser.isPending ||
                !form.name.trim() ||
                (!editing && (!form.email.trim() || form.password.length < 6)) ||
                !form.role_id
              }
            >
              {createUser.isPending || updateUser.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redefinir senha */}
      <Dialog open={Boolean(resetTarget)} onOpenChange={(o) => (o ? null : setResetTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Usuário: <strong>{resetTarget?.name}</strong> ({resetTarget?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={resetPassword}
              minLength={6}
              onChange={(e) => setResetPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => resetPwd.mutate()}
              disabled={resetPwd.isPending || resetPassword.length < 6}
            >
              {resetPwd.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
