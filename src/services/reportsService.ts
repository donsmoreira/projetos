import { supabase } from "./supabase";
import { formatAccountBank } from "../utils/bank";

import type {
  FinancialReportData,
  ReportFiltersData,
  ReportTransaction,
  ReportTransactionType
} from "../types/report";

type BankAccountRelation =
  | {
      id: string;
      name: string;
      bank: string | null;
    }
  | {
      id: string;
      name: string;
      bank: string | null;
    }[]
  | null;

type BankTransactionRow = {
  id: string;
  transaction_date: string;
  description: string;
  value: number | string | null;
  transaction_type: string;
  reference_type: string | null;
  bank_accounts: BankAccountRelation;
};

function getAccountRelation(
  relation: BankAccountRelation
) {
  if (!relation) {
    return null;
  }

  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

function getTransactionType(
  value: number
): ReportTransactionType {
  return value >= 0
    ? "entrada"
    : "saida";
}

function normalizeTransaction(
  transaction: BankTransactionRow
): ReportTransaction {
  const value =
    Number(transaction.value || 0);

  const account =
    getAccountRelation(
      transaction.bank_accounts
    );

  return {
    id:
      transaction.id,

    date:
      transaction.transaction_date,

    description:
      transaction.description,

    accountName:
      formatAccountBank(account) ||
      "Conta não informada",

    // O banco já aparece em accountName ("748 - SICREDI")
    accountBank:
      null,

    type:
      getTransactionType(value),

    value:
      Math.abs(value),

    transactionType:
      transaction.transaction_type,

    referenceType:
      transaction.reference_type
  };
}

export async function getFinancialReport(
  filters: ReportFiltersData
): Promise<FinancialReportData> {
  let query = supabase
    .from("bank_transactions")
    .select(`
      id,
      transaction_date,
      description,
      value,
      transaction_type,
      reference_type,
      bank_accounts (
        id,
        name,
        bank
      )
    `)
    .gte(
      "transaction_date",
      filters.startDate
    )
    .lte(
      "transaction_date",
      filters.endDate
    )
    .order(
      "transaction_date",
      {
        ascending: false
      }
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (
    filters.transactionType ===
    "entrada"
  ) {
    query = query.gte(
      "value",
      0
    );
  }

  if (
    filters.transactionType ===
    "saida"
  ) {
    query = query.lt(
      "value",
      0
    );
  }

  const {
    data,
    error
  } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const transactions =
    ((data ?? []) as BankTransactionRow[])
      .map(normalizeTransaction);

  const totalIncome =
    transactions
      .filter(
        transaction =>
          transaction.type ===
          "entrada"
      )
      .reduce(
        (total, transaction) =>
          total +
          transaction.value,
        0
      );

  const totalExpense =
    transactions
      .filter(
        transaction =>
          transaction.type ===
          "saida"
      )
      .reduce(
        (total, transaction) =>
          total +
          transaction.value,
        0
      );

  return {
    summary: {
      totalIncome,
      totalExpense,
      balance:
        totalIncome -
        totalExpense,
      transactionCount:
        transactions.length
    },

    transactions
  };
}