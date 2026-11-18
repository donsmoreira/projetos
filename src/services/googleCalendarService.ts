import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

export type GoogleScope = "empresa" | "usuario";

/** Conexão com o Google Agenda (sem a chave, que fica só no servidor) */
export interface GoogleConnection {
  id: string;
  scope: GoogleScope;
  user_id: string;
  google_email: string | null;
  calendar_name: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  /** mudanças do Razão ainda não enviadas */
  pending: number;
}

export type GoogleSyncResult = {
  sent: number;
  received: number;
  failed: number;
  connections: number;
};

export const GOOGLE_RETURN_PATH = "/integracoes/google/retorno";

/** Chama a função "google-calendar" (as chaves do Google ficam lá, nunca no site). */
async function callGoogleCalendar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }

    throw new Error(
      /Failed to send|not found|404/i.test(error.message)
        ? "A função google-calendar ainda não foi publicada no Supabase."
        : error.message
    );
  }

  return data as T;
}

/** A conexão da empresa e a minha */
export async function getGoogleConnections(companyId: string): Promise<GoogleConnection[]> {
  const { data, error } = await supabase.rpc("google_calendar_status", { p_company_id: companyId });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []) as GoogleConnection[];
}

/** Abre a tela de autorização do Google */
export async function startGoogleConnection(companyId: string, scope: GoogleScope): Promise<void> {
  const { url } = await callGoogleCalendar<{ url: string }>({
    action: "auth_url",
    companyId,
    scope,
    redirectUri: `${window.location.origin}${GOOGLE_RETURN_PATH}`
  });

  window.location.assign(url);
}

/** Termina a conexão com o código que o Google devolveu */
export async function finishGoogleConnection(code: string, state: string) {
  return callGoogleCalendar<{ ok: boolean; email: string | null; calendarName: string; sent: number; companyId: string }>({
    action: "callback",
    code,
    state
  });
}

/** Envia as mudanças do Razão e (se pull) traz as do Google */
export async function syncGoogleCalendar(companyId: string, pull = true): Promise<GoogleSyncResult> {
  return callGoogleCalendar<GoogleSyncResult>({ action: "sync", companyId, pull });
}

export async function disconnectGoogle(connectionId: string): Promise<{ calendarRemoved: boolean }> {
  return callGoogleCalendar<{ calendarRemoved: boolean }>({ action: "disconnect", connectionId });
}
