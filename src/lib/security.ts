import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Configurações do módulo "Segurança de acesso" (persistidas em system_settings). */
export interface SecuritySettings {
  /** Permitir mais de uma sessão ao mesmo tempo. */
  allowMultipleSessions: boolean;
  /** Tentativas de login antes do bloqueio (0 = sem limite). */
  maxAttempts: number;
  /** Tempo de bloqueio em minutos (após exceder as tentativas). */
  lockMinutes: number;
  /** Validade da senha em dias (0 = nunca expira). */
  passwordValidityDays: number;
  /** Nº de senhas anteriores bloqueadas para reuso (0 = sem histórico). */
  passwordHistory: number;
  /** Logout automático por inatividade em minutos (0 = desativado). */
  inactivityLogoutMin: number;
}

export const DEFAULT_SECURITY: SecuritySettings = {
  allowMultipleSessions: true,
  maxAttempts: 0,
  lockMinutes: 0,
  passwordValidityDays: 0,
  passwordHistory: 0,
  inactivityLogoutMin: 0,
};

const KEYS = [
  "security_allow_multiple_sessions",
  "security_max_attempts",
  "security_lock_minutes",
  "security_password_validity_days",
  "security_password_history",
  "security_inactivity_logout_min",
] as const;

function num(v: unknown, def: number): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function useSecuritySettings() {
  return useQuery({
    queryKey: ["security-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key,value")
        .in("key", KEYS as unknown as string[]);
      const rows = data ?? [];
      const get = (key: string) => rows.find((r) => r.key === key)?.value;
      return {
        allowMultipleSessions: get("security_allow_multiple_sessions") === true,
        maxAttempts: num(get("security_max_attempts"), 0),
        lockMinutes: num(get("security_lock_minutes"), 0),
        passwordValidityDays: num(get("security_password_validity_days"), 0),
        passwordHistory: num(get("security_password_history"), 0),
        inactivityLogoutMin: num(get("security_inactivity_logout_min"), 0),
      } as SecuritySettings;
    },
    staleTime: 10_000,
  });
}

/** Grava uma configuração de segurança (upsert em system_settings). */
export async function saveSecuritySetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from("system_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}
