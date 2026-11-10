export interface BankAccount {
  id: string;
  user_id: string;

  name: string;
  bank: string | null;
  agency: string | null;
  account_number: string | null;

  initial_balance: number;
  overdraft_limit: number;

  created_at?: string;
  updated_at?: string;
}

export interface BankAccountFormData {
  name: string;
  bank: string;
  agency: string;
  accountNumber: string;
  initialBalance: number;
  overdraftLimit: number;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  bank_account_id: string;

  transaction_date: string;
  description: string;
  value: number;
  transaction_type: string;

  reference_type: string | null;
  reference_id: string | null;

  created_at?: string;
}