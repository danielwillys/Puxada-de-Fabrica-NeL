// CONVERGE.AI - manage-users backend function
// Administrative user management: create, update, activate/deactivate, reset
// password and list users. Admin only. Uses the service role to create users
// with a chosen password (the public signup page is disabled).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role_id: number;
}

interface UpdateUserInput {
  user_id: string;
  name?: string;
  role_id?: number;
}

interface SetActiveInput {
  user_id: string;
  active: boolean;
}

interface ResetPasswordInput {
  user_id: string;
  password: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return json(corsHeaders, { ok: false, error: "Não autenticado" }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json(corsHeaders, { ok: false, error: "Sessão inválida" }, 401);
    }
    const actor = userData.user;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,role")
      .eq("id", actor.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return json(corsHeaders, { ok: false, error: "Apenas administradores podem gerenciar usuários" }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json(corsHeaders, { ok: false, error: "Corpo inválido" }, 400);
    const action = String(body.action ?? "");

    switch (action) {
      case "create_user": {
        const i = body as CreateUserInput;
        if (!i.email || !i.password || !i.name || !i.role_id) {
          return json(corsHeaders, { ok: false, error: "Informe e-mail, senha, nome e perfil." }, 400);
        }
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("id,role,name,active")
          .eq("id", i.role_id)
          .maybeSingle();
        if (!roleRow || !roleRow.active) {
          return json(corsHeaders, { ok: false, error: "Perfil inválido ou inativo." }, 400);
        }
        // Create the auth user (no invite: the admin sets the initial password).
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: i.email.trim().toLowerCase(),
          password: i.password,
          email_confirm: true,
          user_metadata: { name: i.name.trim() },
        });
        if (createErr) {
          return json(corsHeaders, { ok: false, error: createErr.message }, 400);
        }
        if (!created.user) {
          return json(corsHeaders, { ok: false, error: "Falha ao criar usuário." }, 500);
        }
        // The on_auth_user_created trigger already inserts the profile row
        // (role 'operator'); upsert so we set the chosen role/role_id instead
        // of hitting a duplicate primary key.
        const { error: profErr } = await supabase
          .from("profiles")
          .upsert(
            {
              id: created.user.id,
              email: i.email.trim().toLowerCase(),
              name: i.name.trim(),
              role: roleRow.role,
              role_id: roleRow.id,
              active: true,
            },
            { onConflict: "id" },
          );
        if (profErr) {
          // Rollback the auth user so the account does not exist without a profile.
          await supabase.auth.admin.deleteUser(created.user.id);
          return json(corsHeaders, { ok: false, error: `Falha ao criar perfil: ${profErr.message}` }, 500);
        }
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: "create_user",
          entity: "profiles",
          entity_id: created.user.id,
          new_value: { email: i.email, name: i.name, role_id: i.role_id, role: roleRow.role },
        });
        return json(corsHeaders, { ok: true });
      }

      case "update_user": {
        const i = body as UpdateUserInput;
        if (!i.user_id) return json(corsHeaders, { ok: false, error: "Usuário não informado." }, 400);
        const patch: Record<string, unknown> = {};
        if (i.name !== undefined) patch.name = i.name.trim();
        if (i.role_id !== undefined) {
          const { data: roleRow } = await supabase
            .from("user_roles")
            .select("id,role,active")
            .eq("id", i.role_id)
            .maybeSingle();
          if (!roleRow || !roleRow.active) {
            return json(corsHeaders, { ok: false, error: "Perfil inválido ou inativo." }, 400);
          }
          patch.role_id = i.role_id;
          patch.role = roleRow.role;
        }
        if (i.user_id === actor.id && (patch.role_id || patch.role)) {
          return json(corsHeaders, { ok: false, error: "Você não pode alterar o próprio perfil." }, 400);
        }
        const { error: updErr } = await supabase
          .from("profiles")
          .update(patch)
          .eq("id", i.user_id);
        if (updErr) return json(corsHeaders, { ok: false, error: updErr.message }, 500);
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: "update_user",
          entity: "profiles",
          entity_id: i.user_id,
          new_value: patch,
        });
        return json(corsHeaders, { ok: true });
      }

      case "set_active": {
        const i = body as SetActiveInput;
        if (!i.user_id) return json(corsHeaders, { ok: false, error: "Usuário não informado." }, 400);
        if (i.user_id === actor.id && !i.active) {
          return json(corsHeaders, { ok: false, error: "Você não pode desativar o próprio acesso." }, 400);
        }
        const { error: actErr } = await supabase
          .from("profiles")
          .update({ active: i.active })
          .eq("id", i.user_id);
        if (actErr) return json(corsHeaders, { ok: false, error: actErr.message }, 500);
        // Block/allow sign-in through the auth user as well.
        if (!i.active) {
          await supabase.auth.admin.updateUserById(i.user_id, {
            ban_duration: "8760h",
          });
        } else {
          await supabase.auth.admin.updateUserById(i.user_id, { ban_duration: "0h" });
        }
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: i.active ? "activate_user" : "deactivate_user",
          entity: "profiles",
          entity_id: i.user_id,
          new_value: { active: i.active },
        });
        return json(corsHeaders, { ok: true });
      }

      case "reset_password": {
        const i = body as ResetPasswordInput;
        if (!i.user_id || !i.password) {
          return json(corsHeaders, { ok: false, error: "Informe usuário e nova senha." }, 400);
        }
        const { error: pwdErr } = await supabase.auth.admin.updateUserById(i.user_id, {
          password: i.password,
        });
        if (pwdErr) return json(corsHeaders, { ok: false, error: pwdErr.message }, 500);
        await supabase.from("audit_logs").insert({
          user_id: actor.id,
          action: "reset_password",
          entity: "profiles",
          entity_id: i.user_id,
          new_value: { reset: true },
        });
        return json(corsHeaders, { ok: true });
      }

      default:
        return json(corsHeaders, { ok: false, error: "Ação desconhecida" }, 400);
    }
  } catch (err) {
    console.error("manage-users failed:", err);
    return json(corsHeaders, { ok: false, error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});

function json(headers: Record<string, string>, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
