import { supabase } from "./supabase";
import { getAuthenticatedUser } from "./auth";

import type {
  AccountKind,
  AccountWithBalance,
  BankAccount,
  BankAccountFormData,
  BankTransaction
} from "../types/bankAccount";

function normalizeAccount(
  account: Record<string, unknown>
): BankAccount {
  return {
    ...account,
    account_type:
      account.account_type === "caixa"
        ? "caixa"
        : "banco",
    initial_balance: Number(account.initial_balance || 0),
    overdraft_limit: Number(account.overdraft_limit || 0)
  } as BankAccount;
}

/**
 * Lista as contas. Sem "kind", traz bancos e caixas juntos
 * (usado nas telas de pagamento e recebimento).
 */
export async function listBankAccounts(
  kind?: AccountKind
): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(error.message);
  }

  const accounts = (data ?? []).map(normalizeAccount);

  return kind
    ? accounts.filter(account => account.account_type === kind)
    : accounts;
}

/**
 * Contas com o saldo atual (saldo inicial + movimentações).
 */
export async function listAccountsWithBalance(
  kind?: AccountKind
): Promise<AccountWithBalance[]> {
  const [accounts, transactions] = await Promise.all([
    listBankAccounts(kind),
    supabase
      .from("bank_transactions")
      .select("bank_account_id, value")
  ]);

  if (transactions.error) {
    throw new Error(transactions.error.message);
  }

  const totals = new Map<string, { sum: number; count: number }>();

  for (const row of transactions.data ?? []) {
    const current = totals.get(row.bank_account_id) ?? { sum: 0, count: 0 };
    current.sum += Number(row.value || 0);
    current.count += 1;
    totals.set(row.bank_account_id, current);
  }

  return accounts.map(account => {
    const total = totals.get(account.id);

    return {
      ...account,
      balance:
        Math.round(
          (account.initial_balance + (total?.sum ?? 0)) * 100
        ) / 100,
      transactionCount: total?.count ?? 0
    };
  });
}

export async function createBankAccount(
  account: BankAccountFormData
): Promise<BankAccount> {
  const user = await getAuthenticatedUser();
  const accountType = account.accountType ?? "banco";

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      user_id: user.id,
      account_type: accountType,
      name: account.name,
      bank: account.bank || null,
      agency: account.agency || null,
      account_number: account.accountNumber || null,
      initial_balance: account.initialBalance,
      overdraft_limit:
        accountType === "caixa"
          ? 0
          : account.overdraftLimit
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeAccount(data);
}

export async function updateBankAccount(
  id: string,
  account: BankAccountFormData
): Promise<BankAccount> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .update({
      name: account.name,
      bank: account.bank || null,
      agency: account.agency || null,
      account_number: account.accountNumber || null,
      initial_balance: account.initialBalance,
      overdraft_limit:
        account.accountType === "caixa"
          ? 0
          : account.overdraftLimit,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeAccount(data);
}

export async function deleteBankAccount(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("bank_accounts")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function listBankTransactions(
  accountId: string
): Promise<BankTransaction[]> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("bank_account_id", accountId)
    .order("transaction_date", {
      ascending: true
    })
    .order("created_at", {
      ascending: true
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(transaction => ({
    ...transaction,
    value: Number(transaction.value || 0)
  })) as BankTransaction[];
}

/**
 * Entrada ou saída avulsa (valor positivo = entrada, negativo = saída).
 */
export async function createBankTransaction(
  transaction: {
    bankAccountId: string;
    date: string;
    description: string;
    value: number;
  }
): Promise<BankTransaction> {
  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("bank_transactions")
    .insert({
      user_id: user.id,
      bank_account_id: transaction.bankAccountId,
      transaction_date: transaction.date,
      description: transaction.description,
      value: transaction.value,
      transaction_type: "manual",
      reference_type: null,
      reference_id: null
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...data,
    value: Number(data.value || 0)
  } as BankTransaction;
}

export async function deleteBankTransaction(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("bank_transactions")
    .delete()
    .eq("id", id)
    .eq("transaction_type", "manual");

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Transferência entre duas contas (ex.: saque do banco para o caixa).
 * As duas movimentações são gravadas juntas no banco de dados.
 */
export async function transferBetweenAccounts(
  transfer: {
    fromAccountId: string;
    toAccountId: string;
    date: string;
    value: number;
    description: string;
  }
): Promise<void> {
  const { error } = await supabase.rpc(
    "transfer_between_accounts",
    {
      p_from_account: transfer.fromAccountId,
      p_to_account: transfer.toAccountId,
      p_date: transfer.date,
      p_value: transfer.value,
      p_description: transfer.description
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Desfaz uma transferência apagando as duas pernas dela.
 */
export async function deleteTransfer(
  transferId: string
): Promise<void> {
  const { error } = await supabase
    .from("bank_transactions")
    .delete()
    .eq("reference_id", transferId)
    .eq("transaction_type", "transfer");

  if (error) {
    throw new Error(error.message);
  }
}
