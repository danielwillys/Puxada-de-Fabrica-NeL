import { useEffect, useState } from "react";
import { Loader2, Palette, RotateCcw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/lib/queries";
import { usePalette } from "@/hooks/use-palette";
import {
  DEFAULT_PALETTE,
  PALETTE_PRESETS,
  type ColorPalette,
} from "@/lib/palette";
import { cn } from "@/lib/utils";

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
            <p className="mb-3 text-sm font-semibold">Parâmetros operacionais</p>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    SLA de armazenagem (puxada → depósito)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Usado nas análises de armazenagem (fase seguinte).
                  </p>
                </div>
                <span className="font-semibold tabular-nums">
                  {slaSetting?.value as number} min
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Faixas de backlog
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Faixas de tempo de espera para o backlog (fase seguinte).
                  </p>
                </div>
                <span className="font-medium tabular-nums">
                  {JSON.stringify(backlogSetting?.value ?? []).slice(0, 60)}
                </span>
              </div>
            </div>
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
