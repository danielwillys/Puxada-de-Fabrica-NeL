import { useEffect, useState } from "react";
import { Loader2, Palette, Plus, RotateCcw, Save, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoPopover } from "@/components/info-popover";
import { useSettings } from "@/lib/queries";
import { usePalette } from "@/hooks/use-palette";
import {
  DEFAULT_PALETTE,
  PALETTE_PRESETS,
  type ColorPalette,
} from "@/lib/palette";
import { cn } from "@/lib/utils";

interface BacklogRange {
  min: number | null;
  max: number | null;
  label: string;
}

const DEFAULT_BACKLOG: BacklogRange[] = [
  { min: 0, max: 30, label: "0-30 min" },
  { min: 31, max: 60, label: "31-60 min" },
  { min: 61, max: 120, label: "61-120 min" },
  { min: 121, max: null, label: "> 120 min" },
];

const BASIS_OPTIONS: {
  value: "confirmed" | "planned" | "min";
  label: string;
  description: string;
}[] = [
  {
    value: "confirmed",
    label: "Quantidade boa confirmada",
    description:
      "A quantidade exigida é a quantidade boa confirmada. Se a confirmada for zero ou indisponível, usa a quantidade da ordem.",
  },
  {
    value: "planned",
    label: "Quantidade da ordem",
    description: "A quantidade exigida é sempre a quantidade planejada da ordem.",
  },
  {
    value: "min",
    label: "Menor entre planejada e produzida",
    description: "A quantidade exigida é o menor valor entre a planejada e a produzida.",
  },
];

export function SettingsPage() {
  const { profile } = useAuth();
  const settings = useSettings();
  const { query: paletteQuery, savePalette } = usePalette();  const [basis, setBasis] = useState<"confirmed" | "planned" | "min">("confirmed");
  const [saving, setSaving] = useState(false);
  const [palette, setPalette] = useState<ColorPalette>(DEFAULT_PALETTE);
  const [slaInput, setSlaInput] = useState("30");
  const [backlogRanges, setBacklogRanges] = useState<BacklogRange[]>(DEFAULT_BACKLOG);
  const [savingOperational, setSavingOperational] = useState(false);

  useEffect(() => {
    const sla = (settings.data ?? []).find((s) => s.key === "storage_sla_minutes");
    if (sla && typeof sla.value === "number") setSlaInput(String(sla.value));
    const bk = (settings.data ?? []).find((s) => s.key === "backlog_ranges");
    if (bk && Array.isArray(bk.value)) {
      setBacklogRanges(
        bk.value.map((r: unknown) => {
          const x = r as BacklogRange;
          return {
            min: typeof x.min === "number" ? x.min : null,
            max: typeof x.max === "number" ? x.max : null,
            label: x.label ?? "Faixa",
          };
        }),
      );
    }
  }, [settings.data]);

  const saveOperational = async () => {
    const sla = Number(slaInput);
    if (!Number.isFinite(sla) || sla <= 0) {
      toast.error("Informe um SLA válido em minutos.");
      return;
    }
    // Ordena as faixas e gera rótulos automáticos.
    const sorted = [...backlogRanges]
      .map((r) => ({ min: r.min, max: r.max, label: r.label }))
      .sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
    setSavingOperational(true);
    try {
      await supabase.from("system_settings").upsert(
        { key: "storage_sla_minutes", value: sla },
        { onConflict: "key" },
      );
      await supabase.from("system_settings").upsert(
        { key: "backlog_ranges", value: sorted },
        { onConflict: "key" },
      );
      settings.refetch();
      toast.success("Parâmetros operacionais atualizados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSavingOperational(false);
    }
  };

  useEffect(() => {
    const row = (settings.data ?? []).find((s) => s.key === "pull_completion_basis");
    if (row && typeof row.value === "string") {
      const v = row.value as "confirmed" | "planned" | "min";
      if (BASIS_OPTIONS.some((o) => o.value === v)) setBasis(v);
    }
  }, [settings.data]);

  // Carrega a paleta persistida quando a query retorna.
  useEffect(() => {
    if (paletteQuery.data) setPalette(paletteQuery.data);
  }, [paletteQuery.data]);

  if (profile?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </Card>
    );
  }

  const slaSetting = (settings.data ?? []).find((s) => s.key === "storage_sla_minutes");
  const backlogSetting = (settings.data ?? []).find((s) => s.key === "backlog_ranges");

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("system_settings")
        .update({ value: basis })
        .eq("key", "pull_completion_basis");
      if (error) throw error;
      await supabase.rpc("refresh_order_metrics");
      settings.refetch();
      toast.success("Base para conclusão da puxada atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Regras de negócio configuráveis — alterações registradas na auditoria
        </p>
      </div>

      {settings.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <Card className="max-w-2xl p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Settings2 className="h-4 w-4 text-primary" /> Base para conclusão da puxada
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              Define qual quantidade a ordem deve atingir para ser considerada{" "}
              <strong>Finalizada</strong>. Planejada ≠ quantidade a puxar.
            </p>
            <div className="flex flex-col gap-2">
              {BASIS_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                    basis === o.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-accent",
                  )}
                >
                  <input
                    type="radio"
                    name="basis"
                    className="mt-1 accent-primary"
                    checked={basis === o.value}
                    onChange={() => setBasis(o.value)}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{o.label}</span>
                    <span className="text-xs text-muted-foreground">{o.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <Button className="mt-4" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar
            </Button>
          </Card>

          <Card className="max-w-2xl p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Parâmetros operacionais</p>
                <p className="text-xs text-muted-foreground">
                  Configurações usadas nos relatórios e no nível de serviço (SLA)
                </p>
              </div>
              <InfoPopover
                title="Parâmetros operacionais"
                items={[
                  {
                    term: "SLA de armazenagem",
                    definition:
                      "Tempo alvo (em minutos) entre a puxada do palete e a armazenagem. Define o % SLA dos relatórios: quanto maior, mais tolerante.",
                  },
                  {
                    term: "Faixas de backlog",
                    definition:
                      "Faixas de tempo de espera usadas para classificar o backlog (atraso) das tarefas de armazenagem.",
                  },
                ]}
              />
            </div>

            <div className="mb-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    SLA de armazenagem (puxada → depósito)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Tempo alvo em minutos para armazenar o palete após a puxada.
                  </p>
                </div>
                <div className="flex w-28 items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    value={slaInput}
                    onChange={(e) => setSlaInput(e.target.value)}
                    className="h-8 text-right tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Faixas de backlog
                </Label>
                <p className="text-xs text-muted-foreground">
                  Defina as faixas de espera (min). Deixe o máximo vazio para a última faixa
                  ("mais que").
                </p>
                <div className="flex flex-col gap-1.5">
                  {backlogRanges.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                      <Input
                        type="number"
                        min={0}
                        value={r.min ?? ""}
                        placeholder="min"
                        onChange={(e) =>
                          setBacklogRanges((prev) =>
                            prev.map((x, xi) =>
                              xi === i
                                ? {
                                    ...x,
                                    min: e.target.value === "" ? null : Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                        className="h-8 w-24 text-right tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">até</span>
                      <Input
                        type="number"
                        min={0}
                        value={r.max ?? ""}
                        placeholder="∞"
                        onChange={(e) =>
                          setBacklogRanges((prev) =>
                            prev.map((x, xi) =>
                              xi === i
                                ? {
                                    ...x,
                                    max: e.target.value === "" ? null : Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                        className="h-8 w-24 text-right tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8"
                        onClick={() =>
                          setBacklogRanges((prev) => prev.filter((_, xi) => xi !== i))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    setBacklogRanges((prev) => [...prev, { min: null, max: null, label: "Nova faixa" }])
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar faixa
                </Button>
              </div>
            </div>

            <Button
              onClick={saveOperational}
              disabled={savingOperational || slaInput === ""}
            >
              {savingOperational ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar parâmetros
            </Button>
          </Card>

          <Card className="max-w-2xl p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Palette className="h-4 w-4 text-primary" /> Paleta de cores
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              Personalize as cores do sistema (padrão N&L: vermelho + azul marinho). A mudança
              vale para todos os usuários.
            </p>

            <div className="mb-4 flex flex-wrap gap-2">
              {PALETTE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setPalette({ ...preset.palette })}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    palette.primary === preset.palette.primary &&
                      palette.accent === preset.palette.accent
                      ? "border-primary bg-primary/5 text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <span className="flex -space-x-1">
                    {[preset.palette.primary, preset.palette.accent, preset.palette.success].map(
                      (c) => (
                        <span
                          key={c}
                          className="h-4 w-4 rounded-full border border-background"
                          style={{ background: c }}
                        />
                      ),
                    )}
                  </span>
                  {preset.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["primary", "Cor principal (botões, links)"],
                  ["accent", "Azul da barra lateral / cabeçalhos"],
                  ["success", "Verde de sucesso"],
                  ["warning", "Amarelo de alerta"],
                  ["danger", "Vermelho de perigo / estorno"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {label}
                    </Label>
                    <p className="font-mono text-xs text-foreground">{palette[key]}</p>
                  </div>
                  <input
                    type="color"
                    value={palette[key]}
                    onChange={(e) =>
                      setPalette({ ...palette, [key]: e.target.value.toUpperCase() })
                    }
                    className="h-9 w-12 cursor-pointer rounded border"
                    title={label}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => savePalette.mutate(palette)}
                disabled={savePalette.isPending}
              >
                {savePalette.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Aplicar paleta
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPalette(DEFAULT_PALETTE);
                  savePalette.mutate(DEFAULT_PALETTE);
                }}
                disabled={savePalette.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão N&L
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
