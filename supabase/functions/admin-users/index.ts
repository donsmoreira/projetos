// Função do Supabase (Edge Function) "admin-users".
// Cadastra usuários (e-mail e senha) nas empresas do ID EMPRESA aberto, troca a
// senha deles e muda as empresas em que operam. Precisa da chave secreta do
// Supabase, por isso roda aqui e não no site. Só administradores podem usar.
//
// Como publicar: Supabase > Edge Functions > Deploy a new function > Via Editor,
// nome "admin-users", colar este arquivo inteiro e clicar em Deploy.
// As chaves (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) já
// existem dentro do Supabase; não é preciso configurar nada.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

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

const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

    // ID EMPRESA com que quem pede entrou
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("active_group_id")
      .eq("user_id", callerId)
      .maybeSingle();

    const groupId = callerProfile?.active_group_id as number | null | undefined;

    if (!groupId) {
      throw new Refusal("Entre com o ID EMPRESA antes de cadastrar usuários.", 403);
    }

    // Empresas deste ID em que quem pede é administrador
    const { data: adminRows, error: adminError } = await admin
      .from("company_members")
      .select("company_id, companies!inner (group_id)")
      .eq("user_id", callerId)
      .eq("is_admin", true)
      .eq("companies.group_id", groupId);

    if (adminError) {
      throw new Error(adminError.message);
    }

    const adminCompanies = new Set((adminRows ?? []).map(row => row.company_id as string));

    if (adminCompanies.size === 0) {
      throw new Refusal("Só administradores podem cadastrar usuários.", 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // Junta o usuário às empresas (com as permissões por tela)
    async function addToCompanies(userId: string, companyIds: string[], isAdmin: boolean, modules: Modules) {
      if (companyIds.length === 0) {
        return;
      }

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
    }

    // -----------------------------------------------------------------------
    // Cadastrar usuário (e-mail e senha) nas empresas marcadas
    // -----------------------------------------------------------------------
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.fullName ?? "").trim();
      const companyIds = checkCompanyIds(body.companyIds);
      const isAdmin = Boolean(body.isAdmin);
      const modules = (body.modules ?? {}) as Modules;

      if (!EMAIL_RULE.test(email)) {
        throw new Refusal("Informe um e-mail válido.");
      }

      if (!fullName) {
        throw new Refusal("Informe o nome da pessoa.");
      }

      if (companyIds.some(id => !adminCompanies.has(id))) {
        throw new Refusal("Você só pode incluir o usuário em empresas deste ID de que é administrador.", 403);
      }

      const { data: existingId, error: findError } = await admin.rpc("find_user_id_by_email", { p_email: email });

      if (findError) {
        throw new Error(findError.message);
      }

      // Conta que já existe: só entra nas empresas (a senha dela não muda)
      if (existingId) {
        const userId = existingId as string;
        const { data: already } = await admin
          .from("company_members")
          .select("company_id")
          .eq("user_id", userId)
          .in("company_id", companyIds);

        const alreadyIds = new Set((already ?? []).map(row => row.company_id as string));
        const toAdd = companyIds.filter(id => !alreadyIds.has(id));

        if (toAdd.length === 0) {
          throw new Refusal("Este e-mail já está em todas as empresas marcadas.");
        }

        await addToCompanies(userId, toAdd, isAdmin, modules);

        return reply({ userId, existing: true });
      }

      const password = checkPassword(body.password);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (createError || !created.user) {
        throw new Error(createError?.message ?? "Não foi possível criar o usuário.");
      }

      const userId = created.user.id;

      try {
        await addToCompanies(userId, companyIds, isAdmin, modules);

        const { error: profileError } = await admin
          .from("profiles")
          .upsert(
            { user_id: userId, full_name: fullName, active_group_id: groupId, active_company_id: companyIds[0] },
            { onConflict: "user_id" }
          );

        if (profileError) {
          throw new Error(profileError.message);
        }
      } catch (error) {
        // Desfaz: sem empresa a conta não serviria para nada
        await admin.auth.admin.deleteUser(userId);
        throw error;
      }

      return reply({ userId, existing: false });
    }

    // -----------------------------------------------------------------------
    // Alvo das outras ações: usuário de uma empresa sua
    // -----------------------------------------------------------------------
    const userId = String(body.userId ?? "");

    if (!UUID_RULE.test(userId)) {
      throw new Refusal("Usuário inválido.");
    }

    if (userId === callerId) {
      throw new Refusal("Para você mesmo, use Meu perfil ou o \"Esqueceu a senha\".");
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

    // Trocar a senha: só se o usuário for apenas de empresas que você administra
    if (action === "reset_password") {
      const password = checkPassword(body.password);

      if (targetCompanies.some(row => !adminCompanies.has(row.company_id))) {
        throw new Refusal(
          "Este usuário também opera em empresas que você não administra. Ele mesmo pode trocar a senha pelo \"Esqueceu a senha\"."
        );
      }

      const { error } = await admin.auth.admin.updateUserById(userId, { password });

      if (error) {
        throw new Error(error.message);
      }

      return reply({ ok: true });
    }

    // Empresas deste ID em que opera (só mexe nas que você administra)
    if (action === "set_companies") {
      const wanted = new Set(checkCompanyIds(body.companyIds));
      const isAdmin = Boolean(body.isAdmin);
      const modules = (body.modules ?? {}) as Modules;

      if ([...wanted].some(id => !adminCompanies.has(id))) {
        throw new Refusal("Você só pode marcar empresas deste ID de que é administrador.", 403);
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

      await addToCompanies(userId, toAdd, isAdmin, modules);

      if (toRemove.length > 0) {
        const { error: removeError } = await admin
          .from("company_members")
          .delete()
          .eq("user_id", userId)
          .in("company_id", toRemove);

        if (removeError) {
          throw new Error(removeError.message);
        }

        await admin
          .from("profiles")
          .update({ active_company_id: null })
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
