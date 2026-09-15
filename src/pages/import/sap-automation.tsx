import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfoPopover } from "@/components/info-popover";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { useIngestionTokens, type IngestionToken } from "@/lib/queries";
import {
  buildPowerShellScript,
  buildReadme,
  buildVbsScript,
  type ConnectorOptions,
} from "@/lib/sap-connector";

/** Gera uma chave aleatória de 32 bytes (hex) com prefixo de identificação. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `nl_${hex}`;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DEFAULT_FORM = {
  name: "Robô SAP — PC da operação",
  exportDir: "C:\\PuxadaNL",
  sapUser: "RPA_PUXADA",
  sapClient: "100",
  sapConnection: "PRD - Produção",
};

export function SapAutomationCard() {
  const { profile } = useAuth();
  const tokens = useIngestionTokens();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  /** Chave em texto puro — existe só nesta sessão, nunca volta do servidor. */
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin";

  const createToken = useMutation({
    mutationFn: async () => {
      const token = generateToken();
      const hash = await sha256Hex(token);
      const { error } = await supabase.from("ingestion_tokens").insert({
        name: form.name.trim(),
        token_hash: hash,
        token_prefix: token.slice(0, 11),
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      setFreshToken(token);
      qc.invalidateQueries({ queryKey: ["ingestion-tokens"] });
      toast.success("Chave gerada. Baixe os arquivos do robô agora.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a chave."),
  });

  const revokeToken = useMutation({
    mutationFn: async (t: IngestionToken) => {
      const { error } = await supabase
        .from("ingestion_tokens")
        .update({ active: !t.active })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingestion-tokens"] });
      toast.success("Chave atualizada.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  const options = (token: string): ConnectorOptions => ({
    token,
    exportDir: form.exportDir.trim().replace(/\\+$/, ""),
    sapUser: form.sapUser.trim(),
    sapClient: form.sapClient.trim(),
    sapConnection: form.sapConnection.trim(),
  });

  const downloadAll = (token: string) => {
    const o = options(token);
    downloadText("PuxadaNL-SAP.vbs", buildVbsScript(o));
    setTimeout(() => downloadText("PuxadaNL-Enviar.ps1", buildPowerShellScript(o)), 300);
    setTimeout(() => downloadText("LEIA-ME.txt", buildReadme(o)), 600);
  };

  if (!isAdmin) return null;

  const rows = tokens.data ?? [];

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-primary" /> Automação SAP (robô)
          <InfoPopover
            title="Como funciona a automação"
            items={[
              {
                term: "Onde o robô roda",
                definition:
                  "Numa máquina da rede interna da N&L (o PC da operação). Ele abre o SAP, faz login, extrai os dados e envia para cá — de hora em hora.",
              },
              {
                term: "Por que não roda aqui",
                definition:
                  "O SAP fica na rede interna e não é acessível pela internet. Além disso, a senha do SAP não deve ficar guardada num sistema web.",
              },
              {
                term: "Chave de integração",
                definition:
                  "É a senha do robô para enviar dados. Ela só permite importar dados, mais nada. Se a máquina for trocada ou a chave vazar, basta revogar e gerar outra.",
              },
              {
                term: "Importação manual",
                definition:
                  "Continua funcionando normalmente como reserva, caso o robô fique fora do ar.",
              },
            ]}
          />
        </p>
        <Button size="sm" onClick={() => { setFreshToken(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Gerar chave e baixar robô
        </Button>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        Gere uma chave, baixe os arquivos do robô e instale no PC da operação. As cargas
        automáticas aparecem no histórico abaixo marcadas como <Badge variant="info">Automática</Badge>.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nenhuma chave de integração criada ainda.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último envio</TableHead>
                <TableHead className="text-right">Envios</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.token_prefix}…
                  </TableCell>
                  <TableCell>
                    {t.active ? (
                      <Badge variant="success">Ativa</Badge>
                    ) : (
                      <Badge variant="danger">Revogada</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {t.last_used_at ? (
                      <>
                        {fmtDateTime(t.last_used_at)}
                        {t.last_used_type ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({t.last_used_type})
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">nunca</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtInt(t.use_count)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => revokeToken.mutate(t)}
                    >
                      {t.active ? (
                        <>
                          <Trash2 className="h-3.5 w-3.5 text-danger" /> Revogar
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-3.5 w-3.5 text-success" /> Reativar
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Gerar chave + baixar arquivos do robô */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {freshToken ? "Chave gerada — baixe os arquivos" : "Configurar robô SAP"}
            </DialogTitle>
            <DialogDescription>
              {freshToken
                ? "Guarde a chave agora: por segurança ela não é exibida novamente."
                : "Estes dados entram nos arquivos do robô. Podem ser ajustados depois no próprio script."}
            </DialogDescription>
          </DialogHeader>

          {freshToken ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span className="text-muted-foreground">
                  A chave já vem gravada dentro do arquivo{" "}
                  <strong>PuxadaNL-Enviar.ps1</strong>. Não precisa copiar à mão — basta
                  baixar os arquivos.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={freshToken} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  title="Copiar chave"
                  onClick={() => {
                    navigator.clipboard.writeText(freshToken);
                    toast.success("Chave copiada.");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={() => downloadAll(freshToken)}>
                <Download className="h-4 w-4" /> Baixar arquivos do robô (3 arquivos)
              </Button>
              <p className="text-xs text-muted-foreground">
                Serão baixados: <strong>PuxadaNL-SAP.vbs</strong> (extrai do SAP),{" "}
                <strong>PuxadaNL-Enviar.ps1</strong> (envia para cá) e{" "}
                <strong>LEIA-ME.txt</strong> (instalação e agendamento de hora em hora).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Nome da chave</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Robô SAP — PC da operação"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Pasta de trabalho no PC</Label>
                <Input
                  value={form.exportDir}
                  onChange={(e) => setForm({ ...form, exportDir: e.target.value })}
                  placeholder="C:\PuxadaNL"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Usuário SAP do robô</Label>
                <Input
                  value={form.sapUser}
                  onChange={(e) => setForm({ ...form, sapUser: e.target.value })}
                  placeholder="RPA_PUXADA"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Mandante (client)</Label>
                <Input
                  value={form.sapClient}
                  onChange={(e) => setForm({ ...form, sapClient: e.target.value })}
                  placeholder="100"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Conexão no SAP Logon</Label>
                <Input
                  value={form.sapConnection}
                  onChange={(e) => setForm({ ...form, sapConnection: e.target.value })}
                  placeholder="PRD - Produção"
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                A senha do SAP <strong>não</strong> é pedida aqui e não fica gravada em
                nenhum arquivo — ela é informada na máquina, no agendamento.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {freshToken ? "Fechar" : "Cancelar"}
            </Button>
            {!freshToken ? (
              <Button
                onClick={() => createToken.mutate()}
                disabled={createToken.isPending || !form.name.trim()}
              >
                {createToken.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Gerar chave
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
