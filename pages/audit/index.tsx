import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateTime } from "@/lib/format";
import { useAuditLogs, useProfiles } from "@/lib/queries";

const ACTION_LABELS: Record<string, string> = {
  import: "Importação",
  update: "Alteração",
  insert: "Criação",
  delete: "Exclusão",
};

export function AuditPage() {
  const { profile } = useAuth();
  const audit = useAuditLogs();
  const profiles = useProfiles();

  if (profile?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </Card>
    );
  }

  const emailOf = (userId: string | null) =>
    (profiles.data ?? []).find((p) => p.id === userId)?.email ?? "—";

  const fmtValue = (v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Importações, alterações de configuração e operações administrativas
        </p>
      </div>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Registros
        </p>
        {audit.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead>Valores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(audit.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(r.created_at)}</TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {emailOf(r.user_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.action === "import" ? "info" : "secondary"}>
                        {ACTION_LABELS[r.action] ?? r.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.entity}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{r.entity_id ?? "—"}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                      {fmtValue(r.new_value ?? r.old_value)}
                    </TableCell>
                  </TableRow>
                ))}
                {(audit.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhum registro de auditoria.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
