import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

import type { ParsedStatementLine } from "../utils/statementParsers";
import type { ImportResult, StatementLine } from "../types/statement";

function fail(message: string): never {
  throw new Error(translateCompanyError(message));
}

/** Linhas do extrato de uma conta no período (inclusive). */
export async function listStatementLines(
  accountId: string,
  from: string,
  to: string
): Promise<StatementLine[]> {
  const { data, error } = await supabase
    .from("bank_statement_lines")
    .select("*")
    .eq("bank_account_id", accountId)
    .gte("posted_date", from)
    .lte("posted_date", to)
    .order("posted_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    fail(error.message);
  }

  return (data ?? []).map(row => ({ ...row, amount: Number(row.amount || 0) })) as StatementLine[];
}

/** Movimentações do sistema já ligadas a alguma linha do extrato (de qualquer data). */
export async function listReconciledTransactionIds(accountId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("bank_statement_lines")
    .select("bank_transaction_id")
    .eq("bank_account_id", accountId)
    .not("bank_transaction_id", "is", null);

  if (error) {
    fail(error.message);
  }

  return new Set((data ?? []).map(row => String(row.bank_transaction_id)));
}

/** Grava as linhas lidas do arquivo; as repetidas são puladas pelo banco. */
export async function importStatementLines(
  accountId: string,
  source: "ofx" | "csv",
  lines: ParsedStatementLine[]
): Promise<ImportResult> {
  const { data, error } = await supabase.rpc("import_statement_lines", {
    p_account_id: accountId,
    p_source: source,
    p_lines: lines.map(line => ({
      external_id: line.externalId,
      date: line.date,
      amount: line.amount,
      description: line.description
    }))
  });

  if (error) {
    fail(error.message);
  }

  const result = data as { inserted?: number; duplicates?: number } | null;

  return {
    inserted: Number(result?.inserted ?? 0),
    duplicates: Number(result?.duplicates ?? 0)
  };
}

/** Liga a linha a uma movimentação existente ou baixa uma conta a pagar/receber. */
export async function reconcileStatementLine(
  lineId: string,
  kind: "transaction" | "payable" | "receivable",
  targetId: string,
  keepRestOpen = true
): Promise<void> {
  const { error } = await supabase.rpc("reconcile_statement_line", {
    p_line_id: lineId,
    p_kind: kind,
    p_target_id: targetId,
    p_keep_rest_open: keepRestOpen
  });

  if (error) {
    fail(error.message);
  }
}

/** Cria um lançamento avulso a partir da linha (ex.: tarifa). */
export async function reconcileStatementLineAsNew(
  lineId: string,
  description: string
): Promise<void> {
  const { error } = await supabase.rpc("reconcile_statement_line_new", {
    p_line_id: lineId,
    p_description: description.trim() || null
  });

  if (error) {
    fail(error.message);
  }
}

export async function setStatementLineIgnored(lineId: string, ignore: boolean): Promise<void> {
  const { error } = await supabase.rpc("ignore_statement_line", {
    p_line_id: lineId,
    p_ignore: ignore
  });

  if (error) {
    fail(error.message);
  }
}

/** Desfaz a conciliação (estorna a baixa ou apaga o avulso, quando for o caso). */
export async function undoStatementReconciliation(lineId: string): Promise<void> {
  const { error } = await supabase.rpc("undo_statement_reconciliation", {
    p_line_id: lineId
  });

  if (error) {
    fail(error.message);
  }
}

/** Guarda o saldo que o próprio banco informou (OFX ou Open Finance). */
export async function setBankReportedBalance(
  accountId: string,
  balance: number,
  date: string,
  source: "ofx" | "openfinance"
): Promise<void> {
  const { error } = await supabase.rpc("set_bank_reported_balance", {
    p_account_id: accountId,
    p_balance: balance,
    p_date: date,
    p_source: source
  });

  if (error) {
    fail(error.message);
  }
}

/** Lança um ajuste para o saldo do sistema ficar igual ao do banco; devolve o valor do ajuste. */
export async function adjustBalanceToBank(accountId: string): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_balance_to_bank", {
    p_account_id: accountId
  });

  if (error) {
    fail(error.message);
  }

  return Number(data ?? 0);
}

export async function deleteStatementLines(lineIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("delete_statement_lines", {
    p_line_ids: lineIds
  });

  if (error) {
    fail(error.message);
  }

  return Number(data ?? 0);
}
