import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SECURITY,
  saveSecuritySetting,
  useSecuritySettings,
  type SecuritySettings,
} from "@/lib/security";

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full tabular-nums"
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Módulo "Segurança de acesso" — políticas de senha, sessão e bloqueio. */
export function SecurityAccessCard() {
  const security = useSecuritySettings();
  const qc = useQueryClient();

  const [multiple, setMultiple] = useState(DEFAULT_SECURITY.allowMultipleSessions);
  const [attempts, setAttempts] = useState(String(DEFAULT_SECURITY.maxAttempts));
  const [lockMin, setLockMin] = useState(String(DEFAULT_SECURITY.lockMinutes));
  const [validity, setValidity] = useState(String(DEFAULT_SECURITY.passwordValidityDays));
  const [history, setHistory] = useState(String(DEFAULT_SECURITY.passwordHistory));
  const [inactivity, setInactivity] = useState(String(DEFAULT_SECURITY.inactivityLogoutMin));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!security.data) return;
    const s: SecuritySettings = security.data;
    setMultiple(s.allowMultipleSessions);
    setAttempts(String(s.maxAttempts));
    setLockMin(String(s.lockMinutes));
    setValidity(String(s.passwordValidityDays));
    setHistory(String(s.passwordHistory));
    setInactivity(String(s.inactivityLogoutMin));
  }, [security.data]);

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSecuritySetting("security_allow_multiple_sessions", multiple);
      await saveSecuritySetting("security_max_attempts", num(attempts));
      await saveSecuritySetting("security_lock_minutes", num(lockMin));
      await saveSecuritySetting("security_password_validity_days", num(validity));
      await saveSecuritySetting("security_password_history", num(history));
      await saveSecuritySetting("security_inactivity_logout_min", num(inactivity));
      qc.invalidateQueries({ queryKey: ["security-settings"] });
      toast.success("Políticas de segurança atualizadas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-3xl p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" /> Segurança de acesso
      </p>
      <p className="mb-4 text-sm text-muted-foreground">
        Políticas gerais de senha, bloqueio e sessão aplicadas a todos os usuários.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Permitir acesso simultâneo</p>
            <p className="text-xs text-muted-foreground">
              Quando desligado, recomenda-se uma única sessão por usuário.
            </p>
          </div>
          <Switch checked={multiple} onCheckedChange={setMultiple} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field
            label="Tentativas p/ bloqueio"
            hint="0 = sem limite"
            value={attempts}
            onChange={setAttempts}
          />
          <Field
            label="Tempo de bloqueio (min)"
            value={lockMin}
            onChange={setLockMin}
          />
          <Field
            label="Validade da senha (dias)"
            hint="0 = nunca expira"
            value={validity}
            onChange={setValidity}
          />
          <Field
            label="Histórico de senhas"
            hint="0 = permite reuso"
            value={history}
            onChange={setHistory}
          />
          <Field
            label="Logout por inatividade (min)"
            hint="0 = desativado"
            value={inactivity}
            onChange={setInactivity}
          />
        </div>
      </div>

      <Button className="mt-4" onClick={save} disabled={saving || security.isLoading}>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar políticas
      </Button>
    </Card>
  );
}
