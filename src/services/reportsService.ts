import { supabase } from "./supabase";
import { formatAccountBank } from "../utils/bank";
import { summarizeTransactions } from "../utils/reportCharts";

import type {
  FinancialReportData,
  ReportFiltersData,
  ReportTransaction,
  ReportTransactionType
} from "../types/report";

type Relation<T> = T | T[] | null;

type BankAccountRow = {
  id: string;
  name: string;
  bank: string | null;
  account_type: string | null;
};

type NamedRow = {
  id: string;
  name: string;
};

type PartyRow = NamedRow & {
  city: string | null;
  state: string | null;
};

type EntryRow = {
  id: string;
  description: string | null;
  installment_group_id: string | null;
  management_account_id: string | null;
  category: string | null;
  management_accounts: Relation<NamedRow>;
  suppliers?: Relation<PartyRow>;
  clients?: Relation<PartyRow>;
};

type BankTransactionRow = {
  id: string;
  bank_account_id: string | null;
  transaction_date: string;
  description: string;
  value: number | string | null;
  transaction_type: string;
  reference_type: string | null;
  bank_accounts: Relation<BankAccountRow>;
  payables: Relation<EntryRow>;
  receivables: Relation<EntryRow>;
};

function first<T>(relation: Relation<T> | undefined): T | null {
  if (!relation) {
    return null;
  }

  return Array.isArray(relation)
    ? relation[0] ?? null
    : relation;
}

function getTransactionType(
  value: number
): ReportTransactionType {
  return value >= 0
    ? "entrada"
    : "saida";
}

/**
 * Tira o número da parcela do nome: "INTERNET (2/5)" → "INTERNET".
 */
export function stripInstallment(description: string): string {
  return description
    .replace(/\s*\((?:parcela\s*)?\d+\s*\/\s*\d+\)\s*$/i, "")
    .trim();
}

function normalizeTransaction(
  transaction: BankTransactionRow
): ReportTransaction {
  const value = Number(transaction.value || 0);
  const account = first(transaction.bank_accounts);
  const payable = first(transaction.payables);
  const receivable = first(transaction.receivables);
  const entry = payable ?? receivable;
  const managementAccount = entry ? first(entry.management_accounts) : null;
  const supplier = payable ? first(payable.suppliers) : null;
  const client = receivable ? first(receivable.clients) : null;

  return {
    id: transaction.id,
    date: transaction.transaction_date,
    description: transaction.description,
    accountId: account?.id ?? transaction.bank_account_id ?? null,
    accountName: formatAccountBank(account) || "Conta não informada",
    // O banco já aparece em accountName ("748 - SICREDI")
    accountBank: null,
    type: getTransactionType(value),
    value: Math.abs(value),
    transactionType: transaction.transaction_type,
    referenceType: transaction.reference_type,
    isTransfer: transaction.transaction_type === "transfer",
    managementAccountId:
      managementAccount?.id ?? entry?.management_account_id ?? null,
    // Lançamentos de antes das contas gerenciais só têm a categoria em texto
    managementAccountName:
      managementAccount?.name ??
      (entry?.category?.trim() ? `${entry.category.trim()} (categoria antiga)` : null),
    counterpartyKey:
      supplier ? `fornecedor:${supplier.id}` : client ? `cliente:${client.id}` : null,
    counterpartyName:
      supplier?.name ?? client?.name ?? null,
    counterpartyCity:
      supplier?.city ?? client?.city ?? null,
    counterpartyState:
      supplier?.state ?? client?.state ?? null,
    entryKey:
      entry ? `${payable ? "pagar" : "receber"}:${entry.installment_group_id ?? entry.id}` : null,
    entryName:
      entry?.description ? stripInstallment(entry.description) : null
  };
}

export async function getFinancialReport(
  filters: ReportFiltersData
): Promise<FinancialReportData> {
  // As relações com payables/receivables são indicadas pelo nome da chave,
  // porque as duas tabelas também apontam de volta para bank_transactions.
  let query = supabase
    .from("bank_transactions")
    .select(`
      id,
      bank_account_id,
      transaction_date,
      description,
      value,
      transaction_type,
      reference_type,
      bank_accounts (
        id,
        name,
        bank,
        account_type
      ),
      payables!bank_transactions_payable_id_fkey (
        id,
        description,
        installment_group_id,
        management_account_id,
        category,
        management_accounts ( id, name ),
        suppliers ( id, name, city, state )
      ),
      receivables!bank_transactions_receivable_id_fkey (
        id,
        description,
        installment_group_id,
        management_account_id,
        category,
        management_accounts ( id, name ),
        clients ( id, name, city, state )
      )
    `)
    .gte("transaction_date", filters.startDate)
    .lte("transaction_date", filters.endDate)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.transactionType === "entrada") {
    query = query.gte("value", 0);
  }

  if (filters.transactionType === "saida") {
    query = query.lt("value", 0);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const transactions =
    ((data ?? []) as unknown as BankTransactionRow[])
      .map(normalizeTransaction);

  return {
    summary: summarizeTransactions(transactions),
    transactions
  };
}
