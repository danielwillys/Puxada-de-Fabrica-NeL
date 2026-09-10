import { useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  REQUIRED_HEADERS,
  normalizeRows,
  type ImportResult,
  type ImportType,
} from "@/lib/importColumns";
import { exportExcel } from "@/lib/excel";
import { parseExcel } from "@/lib/excel";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { useImports } from "@/lib/queries";
import { IMPORT_TYPE_META as IMPORT_META_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES: ImportType[] = ["cooispi", "recebimento", "mon"];

function detectType(headers: string[]): ImportType | null {
  for (const type of TYPES) {
    if (REQUIRED_HEADERS[type].every((h) => headers.includes(h))) return type;
  }
  return null;
}

export function ImportPage() {
  const { profile } = useAuth();
  const imports = useImports();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<ImportType | null>(null);
  const [parsed, setParsed] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  if (profile?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores. Importe apenas com perfil Administrador.
      </Card>
    );
  }

  const missingHeaders = type ? REQUIRED_HEADERS[type].filter((h) => !headers.includes(h)) : [];

  const handleFile = async (f: File | null) => {
    setFile(f);
    setResult(null);
    setParseError(null);
    setParsed([]);
    setHeaders([]);
    setType(null);
    if (!f) return;
    setParsing(true);
    try {
      const rows = await parseExcel(f);
      if (rows.length === 0) {
        setParseError("O arquivo não contém linhas de dados.");
      } else {
        const hs = Object.keys(rows[0] ?? {});
        setHeaders(hs);
        setParsed(rows);
        setType(detectType(hs));
      }
    } catch {
      setParseError("Não foi possível ler o arquivo. Use um arquivo .xlsx ou .xls.");
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    if (!file || !type) return;
    setImporting(true);
    setResult(null);
    try {
      const payload = {
        file_type: type,
        file_name: file.name,
        rows: normalizeRows(parsed, type),
      };
      const { data, error } = await supabase.functions.invoke("process-import", {
        body: payload,
      });
      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          try {
            const body = (await ctx.json()) as { error?: string };
            if (body?.error) msg = body.error;
          } catch {
            // keep the default message
          }
        }
        setResult({ ok: false, error: msg });
      } else {
        setResult((data as ImportResult) ?? { ok: false, error: "Resposta vazia" });
        imports.refetch();
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Erro ao importar" });
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorReport = () => {
    const rows =
      result?.errors?.map((r) => ({
        Linha: r.row,
        Erros: r.errors.join("; "),
      })) ?? [];
    exportExcel(`erros_importacao_${new Date().toISOString().slice(0, 10)}.xlsx`, rows);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Importação de Dados</h1>
        <p className="text-sm text-muted-foreground">
          COOISPI · Recebimento · MON / Puxada UC — validação, deduplicação e histórico
        </p>
      </div>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4 text-primary" /> Enviar arquivo Excel
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                type === t
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-accent",
              )}
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {IMPORT_META_LABELS[t].label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {IMPORT_META_LABELS[t].description}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex min-w-[220px] flex-col gap-1.5">
            <Label htmlFor="file" className="text-xs font-medium text-muted-foreground">
              Arquivo (.xlsx / .xls)
            </Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex min-w-[200px] flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Tipo de arquivo
            </Label>
            <Select
              value={type ?? "select"}
              onValueChange={(v) => setType(v as ImportType)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Selecione ou deixe automático" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {IMPORT_META_LABELS[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!file || !type || importing || missingHeaders.length > 0}
            onClick={runImport}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Validar e importar
          </Button>
        </div>

        {parsing ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo arquivo...
          </div>
        ) : null}

        {parseError ? (
          <p className="mt-3 text-sm text-danger">{parseError}</p>
        ) : null}

        {file && !parsing ? (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{file.name}</Badge>
              <span className="text-muted-foreground">
                {fmtInt(parsed.length)} linhas · {fmtInt(headers.length)} colunas
              </span>
              {type ? (
                <Badge variant="info">
                  Tipo identificado: {IMPORT_META_LABELS[type].label}
                </Badge>
              ) : (
                <Badge variant="warning">
                  Tipo não identificado — selecione manualmente
                </Badge>
              )}
            </div>

            {missingHeaders.length > 0 ? (
              <div className="flex flex-col gap-1 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm">
                <p className="font-medium text-danger">Colunas obrigatórias ausentes:</p>
                <ul className="list-inside list-disc text-danger/90">
                  {missingHeaders.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : type ? (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Colunas obrigatórias presentes.
              </p>
            ) : null}

            {parsed.length > 0 ? (
              <div className="mt-1 overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.slice(0, 8).map((h) => (
                        <TableHead key={h} className="whitespace-nowrap text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, 6).map((r, i) => (
                      <TableRow key={i}>
                        {headers.slice(0, 8).map((h) => (
                          <TableCell key={h} className="whitespace-nowrap text-xs">
                            {String(r[h] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="mt-4 flex flex-col gap-3 rounded-md border p-4">
            {result.ok ? (
              <>
                <p className="flex items-center gap-2 font-semibold text-success">
                  <CheckCircle2 className="h-5 w-5" /> Importação concluída
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Badge variant="secondary" className="justify-center py-2">
                    Total: {fmtInt(result.total)}
                  </Badge>
                  <Badge variant="success" className="justify-center py-2">
                    Inseridas: {fmtInt(result.inserted)}
                  </Badge>
                  <Badge variant="warning" className="justify-center py-2">
                    Atualizadas: {fmtInt(result.updated)}
                  </Badge>
                  <Badge variant="danger" className="justify-center py-2">
                    Rejeitadas: {fmtInt(result.rejected)}
                  </Badge>
                </div>
                {(result.errors?.length ?? 0) > 0 ? (
                  <>
                    <p className="text-sm font-medium text-danger">
                      {fmtInt(result.errors?.length ?? 0)} registros com erro:
                    </p>
                    <div className="max-h-52 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">Linha</TableHead>
                            <TableHead>Erros</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(result.errors ?? []).slice(0, 300).map((e, i) => (
                            <TableRow key={i}>
                              <TableCell>{e.row}</TableCell>
                              <TableCell>{e.errors.join("; ")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button variant="outline" size="sm" className="self-start" onClick={downloadErrorReport}>
                      <XCircle className="h-4 w-4" /> Baixar relatório de erros (Excel)
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              <p className="flex items-center gap-2 font-medium text-danger">
                <XCircle className="h-5 w-5" /> {result.error ?? "Falha na importação"}
              </p>
            )}
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <RefreshCw className="h-4 w-4 text-primary" /> Histórico de importações
        </p>
        {imports.isLoading ? (
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
                  <TableHead>Data</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Inseridas</TableHead>
                  <TableHead className="text-right">Atualizadas</TableHead>
                  <TableHead className="text-right">Rejeitadas</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(imports.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(r.imported_at)}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{r.file_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {IMPORT_META_LABELS[r.file_type]?.label.split(" — ")[0] ?? r.file_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(r.total_records)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(r.inserted_records)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(r.updated_records)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(r.rejected_records)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "success" : "warning"}>
                        {r.status === "completed" ? "Concluída" : r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(imports.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nenhuma importação realizada ainda.
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
