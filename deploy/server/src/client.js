import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave de serviço: usado apenas no servidor, nunca no frontend.
 * Ele ignora a camada RLS — as regras de permissão são verificadas no código
 * (cada rota valida a autenticação antes de agir).
 */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY. Copie .env.example para .env e preencha.",
  );
}

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
