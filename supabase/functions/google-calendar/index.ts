// Função do Supabase (Edge Function) "google-calendar".
// Liga a Agenda do Razão ao Google Agenda, nos dois sentidos.
//
//   auth_url    -> endereço do Google para a pessoa autorizar
//   callback    -> recebe o código do Google, guarda a chave (criptografada)
//                  e cria a agenda "Razão Finance" no Google
//   sync        -> envia as mudanças do Razão (fila) e traz as do Google
//   disconnect  -> desliga a conexão (e apaga a agenda criada no Google)
//
// Conexão da EMPRESA (só administrador): todos os agendamentos.
// Conexão do USUÁRIO: os agendamentos em que ele é o responsável.
//
// Secrets necessários: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.
// Como publicar: Supabase > Edge Functions > Deploy a new function > Via Editor,
// nome "google-calendar", colar este arquivo inteiro e clicar em Deploy.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://razao-finance-arc.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173"
];

const REDIRECT_PATH = "/integracoes/google/retorno";
const SCOPES = "openid email https://www.googleapis.com/auth/calendar.app.created";
const TIME_ZONE = "America/Sao_Paulo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const UUID_RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_COLOR = "#1a5cff";
/** Muda a cada correção: a resposta da sincronização mostra qual versão está publicada */
const FUNCTION_VERSION = "2026-11-18.1";

/** Cores de evento do Google (colorId) — as mesmas sugestões da Agenda do Razão */
const GOOGLE_COLORS: Record<string, string> = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", "6": "#f4511e",
  "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#0b8043", "11": "#d93025"
};

class Refusal extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** A conexão com o Google não vale mais (expirou ou foi revogada) */
class ExpiredConnection extends Error {}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function firstKey(name: string): string {
  const raw = Deno.env.get(name) ?? "";
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------- criptografia

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}

const toBase64Url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text: string) => fromBase64(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));

async function derivedKey(serviceKey: string, purpose: string, usage: "AES-GCM" | "HMAC") {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(`${serviceKey}|google-calendar|${purpose}|v1`));
  return usage === "AES-GCM"
    ? crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"])
    : crypto.subtle.importKey("raw", hash, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function encrypt(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(data))}`;
}

async function decrypt(key: CryptoKey, stored: string) {
  const [version, iv, data] = stored.split(":");
  if (version !== "v1" || !iv || !data) throw new Error("Chave guardada em formato desconhecido.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(data));
  return new TextDecoder().decode(plain);
}

type StatePayload = { c: string; u: string; s: "empresa" | "usuario"; r: string; e: number };

async function signState(key: CryptoKey, payload: StatePayload) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

async function readState(key: CryptoKey, state: string): Promise<StatePayload> {
  const [body, sig] = state.split(".");
  const ok = body && sig && await crypto.subtle.verify("HMAC", key, fromBase64Url(sig), encoder.encode(body));
  if (!ok) throw new Refusal("Retorno do Google inválido. Tente conectar de novo.");
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as StatePayload;
  if (payload.e < Date.now()) throw new Refusal("A autorização demorou demais. Tente conectar de novo.");
  return payload;
}

// ---------------------------------------------------------------- Google

function googleKeys() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) {
    throw new Refusal("Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos Secrets das Edge Functions.", 500);
  }
  return { clientId, clientSecret };
}

async function tokenRequest(params: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const data = await response.json().catch(() => ({})) as Record<string, string>;
  return { ok: response.ok, data };
}

async function accessTokenFrom(refreshToken: string) {
  const { clientId, clientSecret } = googleKeys();
  const { ok, data } = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  if (!ok) {
    if (data.error === "invalid_grant") throw new ExpiredConnection();
    throw new Error(`Google recusou a chave: ${data.error_description ?? data.error ?? "erro"}`);
  }

  return data.access_token;
}

class GoogleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function google<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => ({})) as { error?: { message?: string } };

  if (!response.ok) {
    if (response.status === 401) throw new ExpiredConnection();
    throw new GoogleError(response.status, data.error?.message ?? `Google respondeu ${response.status}`);
  }

  return data as T;
}

// ---------------------------------------------------------------- conversões

type Appointment = {
  id: string;
  company_id: string;
  title: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  all_day: boolean | null;
  status: string;
  notes: string | null;
  color: string | null;
  responsible_id: string | null;
  clients: { name: string } | null;
};

type GoogleEvent = {
  id: string;
  status?: string;
  updated?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  recurringEventId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const STATUS_PREFIX: Record<string, string> = { concluido: "✓ ", faltou: "[Faltou] " };

function hexToRgb(hex: string) {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Cor do Razão → colorId do Google (a mais parecida). Azul padrão = cor da agenda. */
function colorIdFor(color: string | null) {
  if (!color || color.toLowerCase() === DEFAULT_COLOR) return undefined;
  const [r, g, b] = hexToRgb(color);
  let best = "9";
  let bestDistance = Infinity;
  for (const [id, hex] of Object.entries(GOOGLE_COLORS)) {
    const [r2, g2, b2] = hexToRgb(hex);
    const distance = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (distance < bestDistance) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}

function eventBody(appointment: Appointment) {
  const prefix = STATUS_PREFIX[appointment.status] ?? "";
  const client = appointment.clients?.name ? ` · ${appointment.clients.name}` : "";
  const colorId = colorIdFor(appointment.color);

  return {
    summary: `${prefix}${appointment.title || "Agendamento"}${client}`.slice(0, 1000),
    description: appointment.notes ?? "",
    // Dia inteiro: no Google o fim é o dia seguinte (exclusivo)
    ...(appointment.all_day
      ? {
          start: { date: appointment.appointment_date },
          end: { date: nextDay(appointment.appointment_date) }
        }
      : {
          start: { dateTime: `${appointment.appointment_date}T${appointment.start_time.slice(0, 5)}:00`, timeZone: TIME_ZONE },
          end: { dateTime: `${appointment.appointment_date}T${appointment.end_time.slice(0, 5)}:00`, timeZone: TIME_ZONE }
        }),
    ...(colorId ? { colorId } : {}),
    extendedProperties: { private: { razaoId: appointment.id } }
  };
}

/** Data e hora de um evento no horário de Brasília */
function localParts(dateTime: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(dateTime)).map(part => [part.type, part.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "AAAA-MM-DD" do dia seguinte */
function nextDay(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Título do evento → título do agendamento (tira a marca do status e o nome do cliente) */
function titleFromSummary(summary: string, clientName: string | null) {
  let title = summary.trim();
  for (const prefix of Object.values(STATUS_PREFIX)) {
    if (title.startsWith(prefix.trim())) title = title.slice(prefix.trim().length).trim();
  }
  if (clientName && title.endsWith(` · ${clientName}`)) title = title.slice(0, -(` · ${clientName}`).length).trim();
  return title.slice(0, 200) || "Agendamento";
}

// ---------------------------------------------------------------- sincronização

type Connection = {
  id: string;
  company_id: string;
  scope: "empresa" | "usuario";
  user_id: string;
  calendar_id: string | null;
  encrypted_refresh_token: string;
  sync_token: string | null;
};

type Context = {
  admin: SupabaseClient;
  aesKey: CryptoKey;
  tokens: Map<string, string | null>;
};

/** Chave de acesso de uma conexão (null = expirou; já marca o erro) */
async function tokenFor(ctx: Context, connection: Connection) {
  if (ctx.tokens.has(connection.id)) return ctx.tokens.get(connection.id) ?? null;

  try {
    const refresh = await decrypt(ctx.aesKey, connection.encrypted_refresh_token);
    const token = await accessTokenFrom(refresh);
    ctx.tokens.set(connection.id, token);
    return token;
  } catch (error) {
    ctx.tokens.set(connection.id, null);
    await ctx.admin.from("google_calendar_connections").update({
      last_error: error instanceof ExpiredConnection
        ? "A autorização do Google expirou. Clique em Reconectar."
        : String((error as Error).message).slice(0, 300),
      updated_at: new Date().toISOString()
    }).eq("id", connection.id);
    return null;
  }
}

/** Em quais conexões este agendamento deve estar */
function targetsFor(appointment: Appointment | null, connections: Connection[]) {
  if (!appointment || appointment.status === "cancelado") return [];
  return connections.filter(connection =>
    connection.calendar_id &&
    (connection.scope === "empresa" || (connection.scope === "usuario" && connection.user_id === appointment.responsible_id))
  );
}

const APPOINTMENT_SELECT =
  "id, company_id, title, appointment_date, start_time, end_time, all_day, status, notes, color, responsible_id, clients (name)";

/** Envia para o Google tudo o que está na fila da empresa */
async function pushQueue(ctx: Context, companyId: string, connections: Connection[]) {
  const { data: queue, error } = await ctx.admin
    .from("google_calendar_queue")
    .select("id, appointment_id")
    .eq("company_id", companyId)
    .order("id")
    .limit(500);

  if (error) throw new Error(error.message);
  if (!queue?.length) return { sent: 0, failed: 0 };

  const maxId = queue[queue.length - 1].id;
  const ids = [...new Set(queue.map(row => row.appointment_id as string))];
  const done: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const appointmentId of ids) {
    const { data: row } = await ctx.admin.from("appointments").select(APPOINTMENT_SELECT)
      .eq("id", appointmentId).eq("company_id", companyId).maybeSingle();
    const appointment = row as unknown as Appointment | null;
    const targets = targetsFor(appointment, connections);
    const { data: links } = await ctx.admin.from("appointment_google_events").select("*").eq("appointment_id", appointmentId);
    let ok = true;

    // Sai das agendas onde não deve mais estar (excluído, cancelado, mudou de responsável)
    for (const link of links ?? []) {
      if (targets.some(target => target.id === link.connection_id)) continue;
      const connection = connections.find(item => item.id === link.connection_id);
      const token = connection ? await tokenFor(ctx, connection) : null;
      if (connection && !token) { ok = false; continue; }
      if (connection?.calendar_id && token) {
        try {
          await google(token, "DELETE", `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(link.google_event_id)}`);
        } catch (err) {
          if (!(err instanceof GoogleError && (err.status === 404 || err.status === 410))) { ok = false; continue; }
        }
      }
      await ctx.admin.from("appointment_google_events").delete()
        .eq("appointment_id", appointmentId).eq("connection_id", link.connection_id);
      sent++;
    }

    // Cria ou atualiza nas agendas certas
    for (const connection of targets) {
      const token = await tokenFor(ctx, connection);
      if (!token) { ok = false; continue; }
      const calendar = encodeURIComponent(connection.calendar_id!);
      const link = (links ?? []).find(item => item.connection_id === connection.id);
      const body = eventBody(appointment!);

      try {
        let event: GoogleEvent | null = null;

        if (link) {
          try {
            event = await google<GoogleEvent>(token, "PUT", `/calendars/${calendar}/events/${encodeURIComponent(link.google_event_id)}`, body);
          } catch (err) {
            if (!(err instanceof GoogleError && (err.status === 404 || err.status === 410))) throw err;
          }
        }

        if (!event) {
          event = await google<GoogleEvent>(token, "POST", `/calendars/${calendar}/events`, body);
        }

        await ctx.admin.from("appointment_google_events").upsert({
          appointment_id: appointmentId,
          connection_id: connection.id,
          google_event_id: event.id,
          google_updated: event.updated ?? new Date().toISOString(),
          synced_at: new Date().toISOString()
        });
        sent++;
      } catch (err) {
        if (err instanceof ExpiredConnection) ctx.tokens.set(connection.id, null);
        console.error("push", appointmentId, err);
        ok = false;
      }
    }

    if (ok) done.push(appointmentId);
    else failed++;
  }

  if (done.length) {
    await ctx.admin.from("google_calendar_queue").delete()
      .eq("company_id", companyId).lte("id", maxId).in("appointment_id", done);
  }

  return { sent, failed };
}

/** Traz do Google o que mudou na agenda "Razão Finance" de uma conexão */
async function pullConnection(ctx: Context, connection: Connection) {
  const token = await tokenFor(ctx, connection);
  if (!token || !connection.calendar_id) return { changed: 0, details: { "sem autorização": 1 } as Record<string, number> };

  const calendar = encodeURIComponent(connection.calendar_id);
  let syncToken = connection.sync_token;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let changed = 0;
  // Quantos eventos o Google mandou e o que aconteceu com cada um (diagnóstico)
  const details: Record<string, number> = {};

  for (let guard = 0; guard < 40; guard++) {
    const params = new URLSearchParams({ maxResults: "250", showDeleted: "true", singleEvents: "true" });
    if (syncToken) params.set("syncToken", syncToken);
    if (pageToken) params.set("pageToken", pageToken);

    let page: { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };

    try {
      page = await google(token, "GET", `/calendars/${calendar}/events?${params}`);
    } catch (err) {
      // Marcador antigo demais: começa de novo do zero
      if (err instanceof GoogleError && err.status === 410 && syncToken) {
        syncToken = null;
        pageToken = undefined;
        continue;
      }
      throw err;
    }

    details["páginas lidas"] = (details["páginas lidas"] ?? 0) + 1;
    details["eventos lidos"] = (details["eventos lidos"] ?? 0) + (page.items?.length ?? 0);
    if (!page.items) details[`resposta sem itens: ${Object.keys(page ?? {}).join("/").slice(0, 80)}`] = 1;

    for (const event of page.items ?? []) {
      const outcome = await applyEvent(ctx, connection, event);
      if (outcome === "ok") changed++;
      details[outcome] = (details[outcome] ?? 0) + 1;
    }

    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
    if (!pageToken) break;
  }

  await ctx.admin.from("google_calendar_connections").update({
    sync_token: nextSyncToken ?? syncToken,
    last_sync_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString()
  }).eq("id", connection.id);

  return { changed, details };
}

/** Aplica no Razão um evento do Google. Devolve "ok" se mudou algo ou o motivo de não ter mudado. */
async function applyEvent(ctx: Context, connection: Connection, event: GoogleEvent): Promise<string> {
  const { data: link } = await ctx.admin.from("appointment_google_events").select("*")
    .eq("connection_id", connection.id).eq("google_event_id", event.id).maybeSingle();

  // Já é a versão que o próprio Razão gravou
  if (link && event.updated && link.google_updated && new Date(event.updated) <= new Date(link.google_updated)) {
    return "já estava igual";
  }

  const { data: row } = link
    ? await ctx.admin.from("appointments").select(APPOINTMENT_SELECT).eq("id", link.appointment_id).maybeSingle()
    : { data: null };
  const appointment = row as unknown as Appointment | null;

  // Excluído no Google: cancela no Razão (concluído não muda)
  if (event.status === "cancelled") {
    if (!link) return "excluído (não era do Razão)";
    await ctx.admin.from("appointment_google_events").delete()
      .eq("connection_id", connection.id).eq("google_event_id", event.id);
    if (appointment && !["concluido", "cancelado"].includes(appointment.status)) {
      const now = new Date().toISOString();
      await ctx.admin.from("appointments").update({ status: "cancelado", canceled_at: now, updated_at: now }).eq("id", appointment.id);
      return "ok";
    }
    return "excluído (já cancelado)";
  }

  // Eventos que se repetem e de vários dias ficam de fora (o Razão não tem repetição)
  if (event.recurringEventId && !link) return "repetição";

  let start: { date: string; time: string };
  let end: { date: string; time: string };
  let allDay = false;

  if (event.start?.date && event.end?.date) {
    // Dia inteiro de um dia só: no Google o fim é o dia seguinte
    if (event.end.date !== nextDay(event.start.date)) return "vários dias";
    allDay = true;
    start = { date: event.start.date, time: "00:00" };
    end = { date: event.start.date, time: "23:59" };
  } else if (event.start?.dateTime && event.end?.dateTime) {
    start = localParts(event.start.dateTime);
    end = localParts(event.end.dateTime);

    // Terminar à meia-noite (00:00 do dia seguinte) conta como 23:59 do mesmo dia
    if (end.date !== start.date && end.time === "00:00" && end.date === nextDay(start.date)) {
      end.date = start.date;
      end.time = "23:59";
    }

    if (start.date !== end.date || end.time <= start.time) return "vários dias";
  } else {
    return "sem data";
  }

  const color = event.colorId && GOOGLE_COLORS[event.colorId] ? GOOGLE_COLORS[event.colorId] : null;
  const markSynced = (appointmentId: string) =>
    ctx.admin.from("appointment_google_events").upsert({
      appointment_id: appointmentId,
      connection_id: connection.id,
      google_event_id: event.id,
      google_updated: event.updated ?? new Date().toISOString(),
      synced_at: new Date().toISOString()
    });

  if (link && appointment) {
    // Concluído é travado no Razão: a próxima sincronização devolve o que está no Razão
    if (appointment.status === "concluido") {
      await ctx.admin.from("google_calendar_queue").insert({ company_id: appointment.company_id, appointment_id: appointment.id });
      await markSynced(appointment.id);
      return "concluído (travado)";
    }

    const { error } = await ctx.admin.from("appointments").update({
      title: titleFromSummary(event.summary ?? "", appointment.clients?.name ?? null),
      appointment_date: start.date,
      start_time: start.time,
      end_time: end.time,
      all_day: allDay,
      notes: event.description?.trim() || null,
      ...(color ? { color } : {}),
      updated_at: new Date().toISOString()
    }).eq("id", appointment.id);

    if (error) throw new Error(error.message);
    await markSynced(appointment.id);
    return "ok";
  }

  if (link && !appointment) {
    // Agendamento excluído no Razão; a fila vai apagar o evento
    return "excluído no Razão";
  }

  // Evento novo criado no Google: vira agendamento sem cliente
  const { data: created, error } = await ctx.admin.from("appointments").insert({
    company_id: connection.company_id,
    user_id: connection.user_id,
    client_id: null,
    title: titleFromSummary(event.summary ?? "", null),
    appointment_date: start.date,
    start_time: start.time,
    end_time: end.time,
    all_day: allDay,
    notes: event.description?.trim() || null,
    color: color ?? DEFAULT_COLOR,
    responsible_id: connection.scope === "usuario" ? connection.user_id : null,
    status: "agendado"
  }).select("id").single();

  if (error) throw new Error(error.message);
  await markSynced(created.id);
  return "ok";
}

async function loadConnections(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin.from("google_calendar_connections")
    .select("id, company_id, scope, user_id, calendar_id, encrypted_refresh_token, sync_token")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Connection[];
}

/** Coloca na fila os agendamentos (dos últimos 30 dias em diante) que uma conexão deve receber */
async function enqueueExisting(admin: SupabaseClient, connection: Connection) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  let query = admin.from("appointments").select("id").eq("company_id", connection.company_id)
    .gte("appointment_date", since).neq("status", "cancelado");
  if (connection.scope === "usuario") query = query.eq("responsible_id", connection.user_id);
  const { data } = await query.limit(2000);
  const rows = (data ?? []).map(item => ({ company_id: connection.company_id, appointment_id: item.id }));
  for (let i = 0; i < rows.length; i += 500) {
    await admin.from("google_calendar_queue").insert(rows.slice(i, i + 500));
  }
}

// ---------------------------------------------------------------- entrada

Deno.serve(async request => {
  const cors = corsHeaders(request.headers.get("Origin"));
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    if (request.method !== "POST") throw new Refusal("Método não permitido.", 405);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = firstKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = firstKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Chaves do Supabase não encontradas na função.");

    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false }
    });
    const { data: callerData, error: callerError } = await asCaller.auth.getUser();
    if (callerError || !callerData.user) throw new Refusal("Faça login de novo.", 401);
    const userId = callerData.user.id;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const aesKey = await derivedKey(serviceKey, "token", "AES-GCM");
    const stateKey = await derivedKey(serviceKey, "state", "HMAC");

    // Quem chama precisa ser da empresa
    async function membership(companyId: string) {
      if (!UUID_RULE.test(companyId)) throw new Refusal("Empresa inválida.");
      const { data } = await admin.from("company_members").select("is_admin")
        .eq("company_id", companyId).eq("user_id", userId).maybeSingle();
      if (!data) throw new Refusal("Você não participa desta empresa.", 403);
      return { isAdmin: data.is_admin === true };
    }

    function checkRedirect(redirectUri: string) {
      const allowed = ALLOWED_ORIGINS.some(origin => redirectUri === `${origin}${REDIRECT_PATH}`);
      if (!allowed) throw new Refusal("Endereço de retorno não autorizado.");
    }

    if (action === "auth_url") {
      const companyId = String(body.companyId ?? "");
      const scope = body.scope === "empresa" ? "empresa" : "usuario";
      const redirectUri = String(body.redirectUri ?? "");
      const { isAdmin } = await membership(companyId);
      if (scope === "empresa" && !isAdmin) throw new Refusal("Só administradores conectam a agenda da empresa.", 403);
      checkRedirect(redirectUri);

      const { clientId } = googleKeys();
      const state = await signState(stateKey, { c: companyId, u: userId, s: scope, r: redirectUri, e: Date.now() + 15 * 60000 });
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state
      });

      return reply({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    if (action === "callback") {
      const state = await readState(stateKey, String(body.state ?? ""));
      if (state.u !== userId) throw new Refusal("Esta autorização foi iniciada por outro usuário.", 403);
      const { isAdmin } = await membership(state.c);
      if (state.s === "empresa" && !isAdmin) throw new Refusal("Só administradores conectam a agenda da empresa.", 403);

      const { clientId, clientSecret } = googleKeys();
      const { ok, data } = await tokenRequest({
        code: String(body.code ?? ""),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: state.r,
        grant_type: "authorization_code"
      });

      if (!ok) throw new Refusal(`O Google não aceitou a autorização: ${data.error_description ?? data.error ?? "erro"}.`);
      if (!data.refresh_token) throw new Refusal("O Google não enviou a chave de acesso. Tente conectar de novo.");
      if (!String(data.scope ?? "").includes("calendar.app.created")) {
        throw new Refusal("Para conectar, marque a permissão de agenda na tela do Google.");
      }

      let email: string | null = null;
      try {
        const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(String(data.id_token).split(".")[1])));
        email = payload.email ?? null;
      } catch { /* sem e-mail */ }

      const accessToken = data.access_token;
      const { data: company } = await admin.from("companies").select("name").eq("id", state.c).maybeSingle();
      const calendarName = state.s === "empresa"
        ? `Razão Finance · ${company?.name ?? "Empresa"}`
        : `Razão Finance${company?.name ? ` · ${company.name}` : ""} (minha)`;

      // Reconectar: aproveita a agenda que já existe, se ainda estiver lá
      let query = admin.from("google_calendar_connections").select("id, calendar_id").eq("company_id", state.c).eq("scope", state.s);
      if (state.s === "usuario") query = query.eq("user_id", userId);
      const { data: existing } = await query.maybeSingle();

      let calendarId: string | null = null;
      if (existing?.calendar_id) {
        try {
          await google(accessToken, "GET", `/calendars/${encodeURIComponent(existing.calendar_id)}`);
          calendarId = existing.calendar_id;
        } catch { /* agenda sumiu ou é de outra conta Google */ }
      }

      const isNewCalendar = !calendarId;
      if (!calendarId) {
        const created = await google<{ id: string }>(accessToken, "POST", "/calendars", { summary: calendarName, timeZone: TIME_ZONE });
        calendarId = created.id;
      }

      const record = {
        company_id: state.c,
        scope: state.s,
        user_id: userId,
        google_email: email,
        calendar_id: calendarId,
        calendar_name: calendarName,
        encrypted_refresh_token: await encrypt(aesKey, data.refresh_token),
        last_error: null,
        updated_at: new Date().toISOString(),
        ...(isNewCalendar ? { sync_token: null } : {})
      };

      let connectionId = existing?.id as string | undefined;
      if (connectionId) {
        if (isNewCalendar) await admin.from("appointment_google_events").delete().eq("connection_id", connectionId);
        const { error } = await admin.from("google_calendar_connections").update(record).eq("id", connectionId);
        if (error) throw new Error(error.message);
      } else {
        const { data: inserted, error } = await admin.from("google_calendar_connections").insert(record).select("id").single();
        if (error) throw new Error(error.message);
        connectionId = inserted.id;
      }

      const connections = await loadConnections(admin, state.c);
      const connection = connections.find(item => item.id === connectionId)!;
      if (isNewCalendar) await enqueueExisting(admin, connection);

      const ctx: Context = { admin, aesKey, tokens: new Map([[connection.id, accessToken]]) };
      const pushed = await pushQueue(ctx, state.c, connections);
      await pullConnection(ctx, { ...connection, sync_token: isNewCalendar ? null : connection.sync_token });

      return reply({ ok: true, email, calendarName, sent: pushed.sent, companyId: state.c });
    }

    if (action === "sync") {
      const companyId = String(body.companyId ?? "");
      await membership(companyId);
      const connections = await loadConnections(admin, companyId);
      if (connections.length === 0) return reply({ sent: 0, received: 0, failed: 0, connections: 0 });

      const ctx: Context = { admin, aesKey, tokens: new Map() };
      const first = await pushQueue(ctx, companyId, connections);
      let received = 0;
      const doPull = body.pull !== false;
      const details: Record<string, number> = {};
      const pullErrors: string[] = [];

      // full = lê a agenda inteira de novo (não só o que mudou desde a última vez)
      const full = body.full === true;

      if (doPull) {
        for (const connection of connections) {
          try {
            const result = await pullConnection(ctx, full ? { ...connection, sync_token: null } : connection);
            received += result.changed;
            for (const [reason, count] of Object.entries(result.details)) details[reason] = (details[reason] ?? 0) + count;
          } catch (err) {
            console.error("pull", connection.id, err);
            pullErrors.push(String((err as Error).message).slice(0, 300));
            await admin.from("google_calendar_connections").update({
              last_error: String((err as Error).message).slice(0, 300),
              updated_at: new Date().toISOString()
            }).eq("id", connection.id);
          }
        }
      }

      // O que veio do Google vai também para as outras agendas
      const second = received > 0 ? await pushQueue(ctx, companyId, connections) : { sent: 0, failed: 0 };

      return reply({
        sent: first.sent + second.sent,
        received,
        failed: second.failed || first.failed,
        connections: connections.length,
        details,
        pullErrors,
        version: FUNCTION_VERSION
      });
    }

    if (action === "disconnect") {
      const connectionId = String(body.connectionId ?? "");
      if (!UUID_RULE.test(connectionId)) throw new Refusal("Conexão inválida.");
      const { data: connection } = await admin.from("google_calendar_connections")
        .select("id, company_id, scope, user_id, calendar_id, encrypted_refresh_token, sync_token")
        .eq("id", connectionId).maybeSingle();
      if (!connection) throw new Refusal("Conexão não encontrada.", 404);
      const { isAdmin } = await membership(connection.company_id);
      if (!(isAdmin || (connection.scope === "usuario" && connection.user_id === userId))) {
        throw new Refusal("Você não pode desligar esta conexão.", 403);
      }

      // Apaga a agenda criada no Google e devolve a autorização (se ainda valer)
      let calendarRemoved = false;
      try {
        const refresh = await decrypt(aesKey, connection.encrypted_refresh_token);
        const token = await accessTokenFrom(refresh);
        if (connection.calendar_id && body.removeCalendar !== false) {
          await google(token, "DELETE", `/calendars/${encodeURIComponent(connection.calendar_id)}`);
          calendarRemoved = true;
        }
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" });
      } catch (err) {
        console.error("disconnect", err);
      }

      const { error } = await admin.from("google_calendar_connections").delete().eq("id", connectionId);
      if (error) throw new Error(error.message);

      // Sem nenhuma conexão, a fila não serve mais
      const remaining = await loadConnections(admin, connection.company_id);
      if (remaining.length === 0) await admin.from("google_calendar_queue").delete().eq("company_id", connection.company_id);

      return reply({ ok: true, calendarRemoved });
    }

    throw new Refusal("Ação desconhecida.");
  } catch (error) {
    if (error instanceof Refusal) return reply({ error: error.message }, error.status);
    if (error instanceof GoogleError) return reply({ error: `Google: ${error.message}` }, 502);
    console.error(error);
    return reply({ error: "Erro inesperado na integração com o Google Agenda." }, 500);
  }
});
