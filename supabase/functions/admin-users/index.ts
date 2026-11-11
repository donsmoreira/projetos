// Função do Supabase (Edge Function) "admin-users".
// Cria usuários com nome de usuário e senha, troca a senha deles e muda as
// empresas em que operam. Precisa da chave secreta do Supabase, por isso roda
// aqui e não no site. Só administradores das empresas envolvidas podem usar.
//
// Como publicar: Supabase > Edge Functions > Deploy a new function > Via Editor,
// nome "admin-users", colar este arquivo inteiro e clicar em Deploy.
// As chaves (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) já
// existem dentro do Supabase; não é preciso configurar nada.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/** Domínio do e-mail interno: "joao" vira "joao@usuario.razao-finance.local" */
const USERNAME_DOMAIN = "usuario.razao-finance.local";

const ALLOWED_ORIGINS = [
  "https://razao-finance-arc.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173"
];

const MODULES = [
  "painel", "relatorios", "clientes", "fornecedores", "contas_pagar", "contas_receber",
  "caixa", "contas_bancarias", "cartoes", "contas_gerenciais"
];
const VIEW_ONLY = ["painel", "relatorios"];
const WITH_SETTLE = ["contas_pagar", "contas_receber"];

const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const UUID_RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Modules = Record<string, Record<string, boolean>>;

class Refusal extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin":
      origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function isUsernameAccount(email: string | undefined | null) {
  return Boolean(email && email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`));
}

function checkPassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Refusal("A senha precisa ter pelo menos 8 caracteres.");
  }

  if (password.length > 72) {
    throw new Refusal("A senha pode ter no máximo 72 caracteres.");
  }

  return password;
}

function checkCompanyIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Refusal("Marque pelo menos uma empresa.");
  }

  const ids = [...new Set(value.map(String))];

  if (ids.some(id => !UUID_RULE.test(id))) {
    throw new Refusal("Empresa inválida.");
  }

  return ids;
}

/** Linhas de permissão por tela de um usuário numa empresa */
function permissionRows(companyId: string, userId: string, modules: Modules) {
  return MODULES.map(module => {
    const own = modules?.[module] ?? {};
    const crud = !VIEW_ONLY.includes(module);

    return {
      company_id: companyId,
      user_id: userId,
      module,
      can_view: Boolean(own.view),
      can_create: crud && Boolean(own.create),
      can_update: crud && Boolean(own.update),
      can_delete: crud && Boolean(own.delete),
      can_settle: WITH_SETTLE.includes(module) && Boolean(own.settle)
    };
  });
}

/** Linha de membro (as permissões gerais antigas valem se tiver em alguma tela) */
function memberRow(companyId: string, userId: string, isAdmin: boolean, modules: Modules) {
  const rows = permissionRows(companyId, userId, modules);
  const any = (key: "can_create" | "can_update" | "can_delete" | "can_settle") =>
    isAdmin || rows.some(row => row[key]);

  return {
    company_id: companyId,
    user_id: userId,
    is_admin: isAdmin,
    can_create: any("can_create"),
    can_update: any("can_update"),
    can_delete: any("can_delete"),
    can_settle: any("can_settle")
  };
}

Deno.serve(async request => {
  const headers = { ...corsHeaders(request.headers.get("Origin")), "Content-Type": "application/json" };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });

  try {
    if (request.method !== "POST") {
      throw new Refusal("Método não permitido.", 405);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Quem está pedindo (pelo login dele)
    const authorization = request.headers.get("Authorization") ?? "";
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false }
    });
    const { data: callerData, error: callerError } = await asCaller.auth.getUser();

    if (callerError || !callerData.user) {
      throw new Refusal("Faça login de novo.", 401);
    }

    const callerId = callerData.user.id;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Empresas em que quem pede é administrador
    const { data: adminRows, error: adminError } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", callerId)
      .eq("is_admin", true);

    if (adminError) {
      throw new Error(adminError.message);
    }

    const adminCompanies = new Set((adminRows ?? []).map(row => row.company_id as string));

    if (adminCompanies.size === 0) {
      throw new Refusal("Só administradores podem cadastrar usuários.", 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // -----------------------------------------------------------------------
    // Cadastrar usuário com nome de usuário e senha
    // -----------------------------------------------------------------------
    if (action === "create") {
      const username = String(body.username ?? "").trim().toLowerCase();
      const fullName = String(body.fullName ?? "").trim();
      const password = checkPassword(body.password);
      const companyIds = checkCompanyIds(body.companyIds);
      const isAdmin = Boolean(body.isAdmin);
      const modules = (body.modules ?? {}) as Modules;

      if (!USERNAME_RULE.test(username)) {
        throw new Refusal(
          "Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado, começando com letra ou número."
        );
      }

      if (!fullName) {
        throw new Refusal("Informe o nome da pessoa.");
      }

      if (companyIds.some(id => !adminCompanies.has(id))) {
        throw new Refusal("Você só pode incluir o usuário em empresas de que é administrador.", 403);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `${username}@${USERNAME_DOMAIN}`,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, username }
      });

      if (createError || !created.user) {
        if (/already|registered|exists/i.test(createError?.message ?? "")) {
          throw new Refusal("Este nome de usuário já existe. Escolha outro.");
        }

        throw new Error(createError?.message ?? "Não foi possível criar o usuário.");
      }

      const userId = created.user.id;

      try {
        const { error: memberError } = await admin
          .from("company_members")
          .insert(companyIds.map(id => memberRow(id, userId, isAdmin, modules)));

        if (memberError) {
          throw new Error(memberError.message);
        }

        const { error: permissionError } = await admin
          .from("company_member_permissions")
          .insert(companyIds.flatMap(id => permissionRows(id, userId, modules)));

        if (permissionError) {
          throw new Error(permissionError.message);
        }

        const { error: profileError } = await admin
          .from("profiles")
          .upsert(
            { user_id: userId, full_name: fullName, active_company_id: companyIds[0] },
            { onConflict: "user_id" }
          );

        if (profileError) {
          throw new Error(profileError.message);
        }
      } catch (error) {
        // Desfaz: sem empresa o usuário não serviria para nada
        await admin.auth.admin.deleteUser(userId);
        throw error;
      }

      return reply({ userId, username });
    }

    // -----------------------------------------------------------------------
    // Alvo das outras ações: usuário com nome de usuário de uma empresa sua
    // -----------------------------------------------------------------------
    const userId = String(body.userId ?? "");

    if (!UUID_RULE.test(userId)) {
      throw new Refusal("Usuário inválido.");
    }

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);

    if (targetError || !target.user) {
      throw new Refusal("Usuário não encontrado.", 404);
    }

    if (!isUsernameAccount(target.user.email)) {
      throw new Refusal("Só usuários criados aqui (com nome de usuário) podem ser alterados por esta tela.");
    }

    const { data: targetRows, error: targetRowsError } = await admin
      .from("company_members")
      .select("company_id, is_admin")
      .eq("user_id", userId);

    if (targetRowsError) {
      throw new Error(targetRowsError.message);
    }

    const targetCompanies = (targetRows ?? []) as { company_id: string; is_admin: boolean }[];

    if (!targetCompanies.some(row => adminCompanies.has(row.company_id))) {
      throw new Refusal("Este usuário não é de nenhuma empresa sua.", 403);
    }

    // Trocar a senha
    if (action === "reset_password") {
      const password = checkPassword(body.password);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });

      if (error) {
        throw new Error(error.message);
      }

      return reply({ ok: true });
    }

    // Empresas em que opera (só mexe nas empresas de que quem pede é administrador)
    if (action === "set_companies") {
      const wanted = new Set(checkCompanyIds(body.companyIds));
      const isAdmin = Boolean(body.isAdmin);
      const modules = (body.modules ?? {}) as Modules;

      if ([...wanted].some(id => !adminCompanies.has(id))) {
        throw new Refusal("Você só pode marcar empresas de que é administrador.", 403);
      }

      const current = new Set(targetCompanies.map(row => row.company_id));
      const toAdd = [...wanted].filter(id => !current.has(id));
      const toRemove = [...current].filter(id => adminCompanies.has(id) && !wanted.has(id));

      for (const companyId of toRemove) {
        const row = targetCompanies.find(item => item.company_id === companyId);

        if (row?.is_admin) {
          const { count } = await admin
            .from("company_members")
            .select("user_id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("is_admin", true);

          if ((count ?? 0) <= 1) {
            throw new Refusal("Uma das empresas ficaria sem administrador. Marque outro administrador antes.");
          }
        }
      }

      if (toAdd.length > 0) {
        const { error: addError } = await admin
          .from("company_members")
          .insert(toAdd.map(id => memberRow(id, userId, isAdmin, modules)));

        if (addError) {
          throw new Error(addError.message);
        }

        const { error: permissionError } = await admin
          .from("company_member_permissions")
          .insert(toAdd.flatMap(id => permissionRows(id, userId, modules)));

        if (permissionError) {
          throw new Error(permissionError.message);
        }
      }

      if (toRemove.length > 0) {
        const { error: removeError } = await admin
          .from("company_members")
          .delete()
          .eq("user_id", userId)
          .in("company_id", toRemove);

        if (removeError) {
          throw new Error(removeError.message);
        }

        // Se a empresa aberta dele saiu, abre outra que ficou
        const remaining = [...current].filter(id => !toRemove.includes(id)).concat(toAdd);

        await admin
          .from("profiles")
          .update({ active_company_id: remaining[0] ?? null })
          .eq("user_id", userId)
          .in("active_company_id", toRemove);
      }

      return reply({ added: toAdd.length, removed: toRemove.length });
    }

    throw new Refusal("Ação desconhecida.");
  } catch (error) {
    if (error instanceof Refusal) {
      return reply({ error: error.message }, error.status);
    }

    console.error(error);
    return reply({ error: "Não foi possível concluir. Tente de novo em instantes." }, 500);
  }
});
