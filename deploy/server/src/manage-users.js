import { Router } from "express";
import { supabase } from "./client.js";

/**
 * Administração de usuários — porta fiel da função de backend manage-users.
 * Endpoint: POST /manage-users  { action: "create_user" | "update_user" | ... }
 * Autenticação: Bearer JWT do usuário logado; somente administradores.
 */
export const manageUsersRouter = Router();

async function getBearer(req) {
  const auth = req.headers.authorization ?? "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

/** Valida o JWT e garante que o usuário é administrador. */
async function requireAdmin(req, res) {
  const jwt = await getBearer(req);
  if (!jwt) {
    res.status(401).json({ ok: false, error: "Não autenticado" });
    return null;
  }
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData?.user) {
    res.status(401).json({ ok: false, error: "Sessão inválida" });
    return null;
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    res
      .status(403)
      .json({ ok: false, error: "Apenas administradores podem gerenciar usuários" });
    return null;
  }
  return userData.user;
}

manageUsersRouter.post("/", async (req, res) => {
  const actor = await requireAdmin(req, res);
  if (!actor) return;

  const body = req.body ?? {};
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "create_user": {
        const { email, password, name, role_id, must_change_password = false } = body;
        if (!email || !password || !name || !role_id) {
          return res.status(400).json({ ok: false, error: "Informe e-mail, senha, nome e perfil." });
        }
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("id,role,name,active")
          .eq("id", role_id)
          .maybeSingle();
        if (!roleRow || !roleRow.active) {
          return res.status(400).json({ ok: false, error: "Perfil inválido ou inativo." });
        }
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: String(email).trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { name: String(name).trim() },
        });
        if (createErr) return res.status(400).json({ ok: false, error: createErr.message });
        if (!created?.user) return res.status(500).json({ ok: false, error: "Falha ao criar usuário." });

        const { error: profErr } = await supabase
          .from("profiles")
          .upsert(
            {
              id: created.user.id,
              email: String(email).trim().toLowerCase(),
              name: String(name).trim(),
              role: roleRow.role,
              role_id: roleRow.id,
              active: true,
              must_change_password: Boolean(must_change_password),
            },
            { onConflict: "id" },
          );
        if (profErr) {
          await supabase.auth.admin.deleteUser(created.user.id);
          return res.status(500).json({ ok: false, error: `Falha ao criar perfil: ${profErr.message}` });
        }
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: "create_user",
          entity: "profiles",
          entity_id: created.user.id,
          new_value: { email, name, role_id, role: roleRow.role },
        });
        return res.json({ ok: true });
      }

      case "update_user": {
        const { user_id, name, role_id, must_change_password } = body;
        if (!user_id) return res.status(400).json({ ok: false, error: "Usuário não informado." });
        const patch = {};
        if (name !== undefined) patch.name = String(name).trim();
        if (must_change_password !== undefined) patch.must_change_password = Boolean(must_change_password);
        if (role_id !== undefined) {
          const { data: roleRow } = await supabase
            .from("user_roles")
            .select("id,role,active")
            .eq("id", role_id)
            .maybeSingle();
          if (!roleRow || !roleRow.active) {
            return res.status(400).json({ ok: false, error: "Perfil inválido ou inativo." });
          }
          patch.role_id = role_id;
          patch.role = roleRow.role;
        }
        if (user_id === actor.id && (patch.role_id || patch.role)) {
          return res.status(400).json({ ok: false, error: "Você não pode alterar o próprio perfil." });
        }
        const { error: updErr } = await supabase.from("profiles").update(patch).eq("id", user_id);
        if (updErr) return res.status(500).json({ ok: false, error: updErr.message });
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: "update_user",
          entity: "profiles",
          entity_id: user_id,
          new_value: patch,
        });
        return res.json({ ok: true });
      }

      case "set_active": {
        const { user_id, active } = body;
        if (!user_id) return res.status(400).json({ ok: false, error: "Usuário não informado." });
        if (user_id === actor.id && !active) {
          return res.status(400).json({ ok: false, error: "Você não pode desativar o próprio acesso." });
        }
        const { error: actErr } = await supabase.from("profiles").update({ active: Boolean(active) }).eq("id", user_id);
        if (actErr) return res.status(500).json({ ok: false, error: actErr.message });
        await supabase.auth.admin.updateUserById(user_id, {
          ban_duration: active ? "0h" : "8760h",
        });
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: active ? "activate_user" : "deactivate_user",
          entity: "profiles",
          entity_id: user_id,
          new_value: { active: Boolean(active) },
        });
        return res.json({ ok: true });
      }

      case "reset_password": {
        const { user_id, password, must_change_password = true } = body;
        if (!user_id || !password) {
          return res.status(400).json({ ok: false, error: "Informe usuário e nova senha." });
        }
        const { error: pwdErr } = await supabase.auth.admin.updateUserById(user_id, { password });
        if (pwdErr) return res.status(500).json({ ok: false, error: pwdErr.message });
        const { error: flagErr } = await supabase
          .from("profiles")
          .update({ must_change_password: Boolean(must_change_password) })
          .eq("id", user_id);
        if (flagErr) return res.status(500).json({ ok: false, error: flagErr.message });
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: "reset_password",
          entity: "profiles",
          entity_id: user_id,
          new_value: { reset: true, must_change_password: Boolean(must_change_password) },
        });
        return res.json({ ok: true });
      }

      default:
        return res.status(400).json({ ok: false, error: "Ação desconhecida" });
    }
  } catch (err) {
    console.error("manage-users failed:", err);
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Erro interno" });
  }
});
