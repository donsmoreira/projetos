import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

import type { CashBreak, CashSession } from "../types/cashSession";

const NUMBER_FIELDS = [
  "opening_expected",
  "opening_counted",
  "opening_difference",
  "closing_expected",
  "closing_counted",
  "closing_difference",
  "to_backoffice",
  "to_bank",
  "reserve"
] as const;

function normalizeSession(row: Record<string, unknown>): CashSession {
  const session = { ...row } as Record<string, unknown>;

  for (const field of NUMBER_FIELDS) {
    if (session[field] !== null && session[field] !== undefined) {
      session[field] = Number(session[field]);
    }
  }

  return session as unknown as CashSession;
}

function fail(error: { message: string }): never {
  throw new Error(translateCompanyError(error.message));
}

/** Turnos de um caixa, do mais recente para o mais antigo. */
export async function listCashSessions(
  cashAccountId: string,
  limit = 30
): Promise<CashSession[]> {
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("cash_account_id", cashAccountId)
    .order("opened_at", { ascending: false })
    .limit(limit);

  if (error) {
    fail(error);
  }

  return (data ?? []).map(normalizeSession);
}

/** Turnos abertos agora (um por caixa), por id do caixa. */
export async function listOpenSessions(): Promise<Map<string, CashSession>> {
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("status", "aberto");

  if (error) {
    fail(error);
  }

  return new Map(
    (data ?? []).map(row => {
      const session = normalizeSession(row);
      return [session.cash_account_id, session];
    })
  );
}

/**
 * Abre o caixa conferindo o troco.
 * expected = valor que a pessoa viu na tela (o banco confere se não mudou).
 */
export async function openCashSession(data: {
  cashAccountId: string;
  counted: number;
  expected: number;
  acceptDifference: boolean;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc("open_cash_session", {
    p_account_id: data.cashAccountId,
    p_counted: data.counted,
    p_expected: data.expected,
    p_accept_difference: data.acceptDifference,
    p_notes: data.notes
  });

  if (error) {
    fail(error);
  }
}

/** Fecha o caixa (tudo numa operação só no banco: quebra, retaguarda, depósito e trava). */
export async function closeCashSession(data: {
  sessionId: string;
  counted: number;
  expected: number;
  acceptDifference: boolean;
  toBackoffice: number;
  backofficeAccountId: string | null;
  toBank: number;
  bankAccountId: string | null;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc("close_cash_session", {
    p_session_id: data.sessionId,
    p_counted: data.counted,
    p_expected: data.expected,
    p_accept_difference: data.acceptDifference,
    p_to_backoffice: data.toBackoffice,
    p_backoffice_account_id: data.backofficeAccountId,
    p_to_bank: data.toBank,
    p_bank_account_id: data.bankAccountId,
    p_notes: data.notes
  });

  if (error) {
    fail(error);
  }
}

/** Reabre o último fechamento (só administrador). */
export async function reopenCashSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("reopen_cash_session", {
    p_session_id: sessionId
  });

  if (error) {
    fail(error);
  }
}

type BreakRow = {
  id: string;
  transaction_date: string;
  created_at: string;
  bank_account_id: string;
  value: number | string;
  reference_type: string | null;
  reference_id: string | null;
  user_id: string | null;
  bank_accounts: { name: string } | { name: string }[] | null;
};

/** Lançamentos de quebra de caixa no período (com o turno de cada um). */
export async function listCashBreaks(filters: {
  startDate: string;
  endDate: string;
  cashAccountId: string;
}): Promise<CashBreak[]> {
  let query = supabase
    .from("bank_transactions")
    .select("id, transaction_date, created_at, bank_account_id, value, reference_type, reference_id, user_id, bank_accounts (name)")
    .eq("transaction_type", "cash_adjustment")
    .gte("transaction_date", filters.startDate)
    .lte("transaction_date", filters.endDate)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.cashAccountId) {
    query = query.eq("bank_account_id", filters.cashAccountId);
  }

  const { data, error } = await query;

  if (error) {
    fail(error);
  }

  const rows = (data ?? []) as unknown as BreakRow[];
  const sessionIds = [...new Set(rows.map(row => row.reference_id).filter(Boolean))] as string[];

  const sessions = new Map<string, CashSession>();

  if (sessionIds.length > 0) {
    const { data: sessionRows, error: sessionError } = await supabase
      .from("cash_sessions")
      .select("*")
      .in("id", sessionIds);

    if (sessionError) {
      fail(sessionError);
    }

    for (const row of sessionRows ?? []) {
      const session = normalizeSession(row);
      sessions.set(session.id, session);
    }
  }

  return rows.map(row => {
    const account = Array.isArray(row.bank_accounts) ? row.bank_accounts[0] : row.bank_accounts;
    const session = row.reference_id ? sessions.get(row.reference_id) : undefined;
    const atOpening = row.reference_type === "cash_opening";

    return {
      id: row.id,
      date: row.transaction_date,
      createdAt: row.created_at,
      cashAccountId: row.bank_account_id,
      cashName: account?.name ?? "Caixa",
      moment: atOpening ? "abertura" : "fechamento",
      sessionId: row.reference_id,
      expected: session ? (atOpening ? session.opening_expected : session.closing_expected) : null,
      counted: session ? (atOpening ? session.opening_counted : session.closing_counted) : null,
      difference: Number(row.value || 0),
      userId: row.user_id
    };
  });
}
