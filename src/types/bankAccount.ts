/** "banco" = conta bancária · "caixa" = dinheiro físico */
export type AccountKind =
  | "banco"
  | "caixa";

/** Caixa de operação (abre e fecha em turnos) ou de retaguarda (cofre: recebe no fechamento) */
export type CashRole =
  | "operacao"
  | "retaguarda";

export interface BankAccount {
  id: string;
  user_id: string;

  account_type: AccountKind;

  /** Só para caixa */
  cash_role: CashRole;

  name: string;
  bank: string | null;
  agency: string | null;
  account_number: string | null;

  initial_balance: number;
  overdraft_limit: number;

  /** Último saldo informado pelo próprio banco (OFX ou Open Finance) */
  bank_balance?: number | null;
  bank_balance_date?: string | null;
  bank_balance_source?: "ofx" | "openfinance" | null;
  bank_balance_updated_at?: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface BankAccountFormData {
  accountType?: AccountKind;
  cashRole?: CashRole;
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

  /** Turno do caixa em que entrou (caixa de operação) */
  cash_session_id?: string | null;

  created_at?: string;
}

export interface AccountWithBalance extends BankAccount {
  balance: number;
  transactionCount: number;
}