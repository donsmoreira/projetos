import { supabase } from "./supabase";
import { listCreditCards } from "./creditCardsService";
import { formatAccountBank } from "../utils/bank";

import type {
  BankAccountItem,
  DashboardData,
  FinancialSummary,
  PayableItem,
  ReceivableItem
} from "../pages/Dashboard/dashboardTypes";

type SupplierRelation =
  | {
      id: string;
      name: string;
    }
  | {
      id: string;
      name: string;
    }[]
  | null;

type ClientRelation =
  | {
      id: string;
      name: string;
    }
  | {
      id: string;
      name: string;
    }[]
  | null;

type PayableRow = {
  id: string;
  description: string;
  original_value: number | string | null;
  interest: number | string | null;
  penalty: number | string | null;
  due_date: string;
  suppliers: SupplierRelation;
};

type ReceivableRow = {
  id: string;
  description: string;
  original_value: number | string | null;
  interest: number | string | null;
  penalty: number | string | null;
  due_date: string;
  clients: ClientRelation;
};

type BankAccountRow = {
  id: string;
  name: string;
  bank: string | null;
  agency: string | null;
  account_number: string | null;
  account_type?: string | null;
  initial_balance: number | string | null;
};

type BankTransactionRow = {
  id: string;
  bank_account_id: string;
  value: number | string | null;
};



function numberValue(value: number | string | null | undefined) {
  return Number(value || 0);
}

function calculateEntryValue(entry: {
  original_value: number | string | null;
  interest: number | string | null;
  penalty: number | string | null;
}) {
  return (
    numberValue(entry.original_value) +
    numberValue(entry.interest) +
    numberValue(entry.penalty)
  );
}

function getRelationName(
  relation: SupplierRelation | ClientRelation,
  fallback: string
) {
  if (!relation) {
    return fallback;
  }

  if (Array.isArray(relation)) {
    return relation[0]?.name || fallback;
  }

  return relation.name || fallback;
}

async function getPendingPayables() {
  const { data, error } = await supabase
    .from("payables")
    .select(`
      id,
      description,
      original_value,
      interest,
      penalty,
      due_date,
      suppliers (
        id,
        name
      )
    `)
    .eq("status", "pendente")
    .order("due_date", {
      ascending: true
    });

  if (error) {
    throw new Error(
      `Erro ao carregar contas a pagar: ${error.message}`
    );
  }

  return (data ?? []) as PayableRow[];
}

async function getPendingReceivables() {
  const { data, error } = await supabase
    .from("receivables")
    .select(`
      id,
      description,
      original_value,
      interest,
      penalty,
      due_date,
      clients (
        id,
        name
      )
    `)
    .eq("status", "pendente")
    .order("due_date", {
      ascending: true
    });

  if (error) {
    throw new Error(
      `Erro ao carregar contas a receber: ${error.message}`
    );
  }

  return (data ?? []) as ReceivableRow[];
}

async function getBankAccounts() {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select(`
      id,
      name,
      bank,
      agency,
      account_number,
      account_type,
      initial_balance
    `)
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(
      `Erro ao carregar contas bancárias: ${error.message}`
    );
  }

  return (data ?? []) as BankAccountRow[];
}

async function getBankTransactions() {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select(`
      id,
      bank_account_id,
      value
    `);

  if (error) {
    throw new Error(
      `Erro ao carregar movimentações bancárias: ${error.message}`
    );
  }

  return (data ?? []) as BankTransactionRow[];
}



function buildBankAccounts(
  accounts: BankAccountRow[],
  transactions: BankTransactionRow[]
): BankAccountItem[] {
  return accounts.map(account => {
    const transactionBalance = transactions
      .filter(
        transaction =>
          transaction.bank_account_id === account.id
      )
      .reduce(
        (total, transaction) =>
          total + numberValue(transaction.value),
        0
      );

    return {
      id: account.id,
      account: account.account_type === "caixa"
        ? "Dinheiro físico"
        : [
          account.agency?.trim()
            ? `Ag. ${account.agency.trim()}`
            : "",
          account.account_number?.trim()
            ? `Conta ${account.account_number.trim()}`
            : ""
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      bank: formatAccountBank(account) || "—",
      balance:
        numberValue(account.initial_balance) +
        transactionBalance
    };
  });
}

export async function getDashboardData(): Promise<DashboardData> {
  const [
  payables,
  receivables,
  bankAccountRows,
  bankTransactions,
  creditCards
] = await Promise.all([
  getPendingPayables(),
  getPendingReceivables(),
  getBankAccounts(),
  getBankTransactions(),
  listCreditCards()
]);

  const totalCardUsage = creditCards.reduce(
    (total, card) =>
      total + card.used_limit,
    0
  );

  const totalPayables = payables.reduce(
    (total, payable) =>
      total + calculateEntryValue(payable),
    0
  );

  const totalReceivables = receivables.reduce(
    (total, receivable) =>
      total + calculateEntryValue(receivable),
    0
  );

  const bankAccounts = buildBankAccounts(
    bankAccountRows,
    bankTransactions
  );

  const totalBankBalance = bankAccounts.reduce(
  (total, account) =>
    total + account.balance,
  0
);

const summary: FinancialSummary[] = [
  {
    label: "Total a pagar",
    value: totalPayables,
    variant: "payable"
  },
  {
    label: "Total a receber",
    value: totalReceivables,
    variant: "receivable"
  },
  {
    label: "Saldo em contas",
    value: totalBankBalance,
    variant: "neutral"
  },
  {
    label: "Limite utilizado em cartões",
    value: totalCardUsage,
    variant: "payable"
  }
];

  const upcomingPayables: PayableItem[] = payables
    .slice(0, 6)
    .map(payable => ({
      id: payable.id,
      supplier: getRelationName(
        payable.suppliers,
        "Fornecedor não informado"
      ),
      description: payable.description,
      dueDate: payable.due_date,
      value: calculateEntryValue(payable)
    }));

  const upcomingReceivables: ReceivableItem[] =
    receivables
      .slice(0, 6)
      .map(receivable => ({
        id: receivable.id,
        client: getRelationName(
          receivable.clients,
          "Cliente não informado"
        ),
        description: receivable.description,
        dueDate: receivable.due_date,
        value: calculateEntryValue(receivable)
      }));

  return {
    summary,
    upcomingPayables,
    upcomingReceivables,
    bankAccounts
  };
}