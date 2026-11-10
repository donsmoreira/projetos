import { supabase } from "./supabase";
import { getAuthenticatedUser } from "./auth";

import type {
  BankAccount,
  BankAccountFormData,
  BankTransaction
} from "../types/bankAccount";

export async function listBankAccounts(): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(account => ({
    ...account,
    initial_balance: Number(account.initial_balance || 0),
    overdraft_limit: Number(account.overdraft_limit || 0)
  })) as BankAccount[];
}

export async function createBankAccount(
  account: BankAccountFormData
): Promise<BankAccount> {
  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      user_id: user.id,
      name: account.name,
      bank: account.bank || null,
      agency: account.agency || null,
      account_number: account.accountNumber || null,
      initial_balance: account.initialBalance,
      overdraft_limit: account.overdraftLimit
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...data,
    initial_balance: Number(data.initial_balance || 0),
    overdraft_limit: Number(data.overdraft_limit || 0)
  } as BankAccount;
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
      overdraft_limit: account.overdraftLimit,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...data,
    initial_balance: Number(data.initial_balance || 0),
    overdraft_limit: Number(data.overdraft_limit || 0)
  } as BankAccount;
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
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(transaction => ({
    ...transaction,
    value: Number(transaction.value || 0)
  })) as BankTransaction[];
}

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