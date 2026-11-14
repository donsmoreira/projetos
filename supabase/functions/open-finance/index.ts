// Função do Supabase (Edge Function) "open-finance".
// Conversa com o agregador de Open Finance (Pluggy) usando as chaves que ficam
// só aqui no servidor. O site pede:
//   - connect_token: token de uso único para abrir a janela "Conectar banco";
//   - item_accounts: contas da conexão recém-feita (para escolher qual ligar);
//   - sync: traz os lançamentos da conta ligada para o extrato da conciliação.
// Tudo o que grava no banco passa pelas funções SQL com o login do próprio
// usuário (as mesmas permissões da tela).
//
// Como publicar: Supabase > Edge Functions > Deploy a new function > Via Editor,
// nome "open-finance", colar este arquivo inteiro e clicar em Deploy.
// Antes, em Edge Functions > Secrets, cadastrar:
//   PLUGGY_CLIENT_ID     (Client ID da Pluggy)
//   PLUGGY_CLIENT_SECRET (Client Secret da Pluggy)
// SUPABASE_URL e SUPABASE_ANON_KEY já existem dentro do Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";

const PLUGGY_API = "https://api.pluggy.ai";

const ALLOWED_ORIGINS = [
  "https://razao-finance-arc.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173"
];

const UUID_RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RULE = /^[0-9A-Za-z-]{6,80}$/;

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

/** Primeira chave de uma lista do Supabase (JSON {"default": "..."} ou texto puro) */
function firstKey(name: string): string {
  const raw = Deno.env.get(name) ?? "";

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Pluggy
// ---------------------------------------------------------------------------

let cachedApiKey: { value: string; expires: number } | null = null;

async function pluggyApiKey(): Promise<string> {
  if (cachedApiKey && cachedApiKey.expires > Date.now()) {
    return cachedApiKey.value;
  }

  const clientId = Deno.env.get("PLUGGY_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET") ?? "";

  if (!clientId || !clientSecret) {
    throw new Refusal(
      "O Open Finance ainda não foi configurado: faltam as chaves da Pluggy nos Secrets da função.",
      500
    );
  }

  const response = await fetch(`${PLUGGY_API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret })
  });

  if (!response.ok) {
    throw new Refusal("A Pluggy recusou as chaves. Confira o Client ID e o Client Secret nos Secrets.", 502);
  }

  const data = await response.json() as { apiKey?: string };

  if (!data.apiKey) {
    throw new Refusal("A Pluggy não devolveu a chave de acesso.", 502);
  }

  // A chave vale 2 horas; renova antes
  cachedApiKey = { value: data.apiKey, expires: Date.now() + 90 * 60 * 1000 };
  return data.apiKey;
}

async function pluggy<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = await pluggyApiKey();
  const response = await fetch(`${PLUGGY_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Pluggy", path, response.status, detail.slice(0, 300));

    if (response.status === 404) {
      throw new Refusal("A conexão com o banco não foi encontrada na Pluggy. Conecte o banco de novo.", 404);
    }

    // Motivo da Pluggy (sem dados sensíveis) para saber o que corrigir
    let reason = "";

    try {
      const parsed = JSON.parse(detail) as { message?: string; code?: number | string };
      reason = String(parsed.message ?? "").slice(0, 160);
    } catch {
      reason = detail.slice(0, 160);
    }

    throw new Refusal(
      `O Open Finance recusou a consulta (${response.status} em ${path.split("?")[0].replace(/\/[0-9a-f-]{20,}/gi, "/…")})${reason ? `: ${reason}` : ""}. Tente de novo em alguns minutos.`,
      502
    );
  }

  return await response.json() as T;
}

type PluggyItem = {
  id: string;
  clientUserId?: string | null;
  status?: string;
  executionStatus?: string;
  connector?: { name?: string } | null;
  consentExpiresAt?: string | null;
};

type PluggyAccount = {
  id: string;
  itemId?: string;
  type: string;
  subtype?: string;
  name?: string;
  marketingName?: string | null;
  number?: string | null;
  balance?: number;
};

type PluggyTransaction = {
  id: string;
  date: string;
  description?: string;
  descriptionRaw?: string | null;
  amount: number;
  type?: "CREDIT" | "DEBIT";
  status?: string;
};

/** A conexão foi feita por esta empresa? (o token marca a empresa no item) */
async function ownedItem(itemId: string, company: string): Promise<PluggyItem> {
  if (!ID_RULE.test(itemId)) {
    throw new Refusal("Conexão do banco inválida.");
  }

  const item = await pluggy<PluggyItem>(`/items/${itemId}`);

  if (item.clientUserId !== company) {
    throw new Refusal("Esta conexão não pertence à empresa aberta.", 403);
  }

  return item;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------

Deno.serve(async request => {
  const cors = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" }
    });

  try {
    if (request.method !== "POST") {
      throw new Refusal("Método não permitido.", 405);
    }

    const authorization = request.headers.get("authorization") ?? "";

    if (!authorization.startsWith("Bearer ")) {
      throw new Refusal("Entre no sistema primeiro.", 401);
    }

    // Cliente do Supabase COM o login do usuário: valem as permissões dele
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", firstKey("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false }
    });

    const { data: userData, error: userError } = await db.auth.getUser();

    if (userError || !userData.user) {
      throw new Refusal("Sessão expirada. Entre no sistema de novo.", 401);
    }

    const { data: profile } = await db
      .from("profiles")
      .select("active_company_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const company = String(profile?.active_company_id ?? "");

    if (!UUID_RULE.test(company)) {
      throw new Refusal("Abra uma empresa primeiro.");
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");

    // 1) Token para abrir a janela de conexão (marca a empresa no item)
    if (action === "connect_token") {
      const itemId = body.itemId ? String(body.itemId) : "";

      if (itemId) {
        await ownedItem(itemId, company);
      }

      const token = await pluggy<{ accessToken: string }>("/connect_token", {
        method: "POST",
        body: JSON.stringify({
          ...(itemId ? { itemId } : {}),
          options: { clientUserId: company, avoidDuplicates: true }
        })
      });

      return reply({ accessToken: token.accessToken });
    }

    // 2) Contas de uma conexão (só contas correntes/poupança, não cartão)
    if (action === "item_accounts") {
      const item = await ownedItem(String(body.itemId ?? ""), company);
      const accounts = await pluggy<{ results: PluggyAccount[] }>(
        `/accounts?itemId=${encodeURIComponent(item.id)}&type=BANK`
      );

      return reply({
        itemId: item.id,
        connectorName: item.connector?.name ?? "Banco",
        status: item.status ?? "",
        consentExpiresAt: item.consentExpiresAt ?? null,
        accounts: (accounts.results ?? []).map(account => ({
          id: account.id,
          name: account.marketingName || account.name || "Conta",
          number: account.number ?? "",
          subtype: account.subtype ?? "",
          balance: Number(account.balance ?? 0)
        }))
      });
    }

    // 3) Sincronizar: traz os lançamentos para o extrato da conciliação
    if (action === "sync") {
      const connectionId = String(body.connectionId ?? "");

      if (!UUID_RULE.test(connectionId)) {
        throw new Refusal("Conexão inválida.");
      }

      // Lida com o login do usuário: só acha se for da empresa e ele puder ver
      const { data: connection, error: connectionError } = await db
        .from("bank_connections")
        .select("*")
        .eq("id", connectionId)
        .maybeSingle();

      if (connectionError || !connection) {
        throw new Refusal("Conexão não encontrada.", 404);
      }

      try {
        const item = await ownedItem(String(connection.item_id), company);
        const account = await pluggy<PluggyAccount>(`/accounts/${encodeURIComponent(connection.provider_account_id)}`);

        if (account.itemId && account.itemId !== item.id) {
          throw new Refusal("A conta do banco não pertence a esta conexão.", 403);
        }

        // Da última sincronização (com folga de 7 dias) ou dos últimos 90 dias
        const today = new Date();
        const start = connection.last_sync_at
          ? new Date(new Date(connection.last_sync_at).getTime() - 7 * 86400000)
          : new Date(today.getTime() - 90 * 86400000);

        const lines: { external_id: string; date: string; amount: number; description: string }[] = [];

        // Endereço novo da Pluggy (/v2/transactions), páginas de 500 com cursor:
        // cada resposta traz "next" (?accountId=...&after=...) até acabar (null)
        let next: string | null =
          `?accountId=${encodeURIComponent(account.id)}&dateFrom=${isoDate(start)}&dateTo=${isoDate(today)}`;
        let pages = 0;

        while (next && pages < 40) {
          const result: { results?: PluggyTransaction[]; next?: string | null } =
            await pluggy<{ results?: PluggyTransaction[]; next?: string | null }>(`/v2/transactions${next}`);

          pages += 1;
          next = result.next && result.next.startsWith("?") ? result.next : null;

          for (const tx of result.results ?? []) {
            // Só lançamento efetivado (pendente ainda pode mudar)
            if (tx.status && tx.status !== "POSTED") continue;

            const value = Math.round(Math.abs(Number(tx.amount || 0)) * 100) / 100;

            if (!value) continue;

            const signed = tx.type === "DEBIT" || (!tx.type && Number(tx.amount) < 0) ? -value : value;

            lines.push({
              external_id: `pluggy:${tx.id}`,
              date: String(tx.date).slice(0, 10),
              amount: signed,
              description: (tx.description || tx.descriptionRaw || "Lançamento do banco").slice(0, 300)
            });
          }
        }

        let inserted = 0;
        let duplicates = 0;

        // Em blocos (o banco aceita até 5.000 por vez)
        for (let index = 0; index < lines.length; index += 1000) {
          const { data, error } = await db.rpc("import_statement_lines", {
            p_account_id: connection.bank_account_id,
            p_source: "openfinance",
            p_lines: lines.slice(index, index + 1000)
          });

          if (error) {
            throw new Refusal(error.message);
          }

          inserted += Number((data as { inserted?: number })?.inserted ?? 0);
          duplicates += Number((data as { duplicates?: number })?.duplicates ?? 0);
        }

        await db.rpc("mark_bank_connection_synced", {
          p_connection_id: connection.id,
          p_error: null,
          p_consent_expires_at: item.consentExpiresAt ?? null
        });

        return reply({
          inserted,
          duplicates,
          bankBalance: Number(account.balance ?? 0),
          from: isoDate(start),
          to: isoDate(today)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha na sincronização.";
        await db.rpc("mark_bank_connection_synced", { p_connection_id: connection.id, p_error: message });
        throw error;
      }
    }

    throw new Refusal("Ação desconhecida.");
  } catch (error) {
    if (error instanceof Refusal) {
      return reply({ error: error.message }, error.status);
    }

    console.error(error);
    return reply({ error: "Erro inesperado no Open Finance." }, 500);
  }
});
