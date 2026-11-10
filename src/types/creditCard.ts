export interface CreditCardBankAccount {
  id: string;
  name: string;
  bank: string | null;
}

export interface CreditCard {
  id: string;
  user_id: string;

  // Conta bancária cadastrada à qual o cartão pertence (e que paga a fatura)
  bank_account_id: string | null;
  bank_accounts: CreditCardBankAccount | null;

  name: string;
  brand: string | null;

  final_digits: string | null;
  holder_name: string | null;

  // limit_total vem da coluna credit_limit.
  // used_limit = compras (card_transactions) - pagamentos de fatura (card_settlements)
  // available_limit = limit_total - used_limit
  limit_total: number;
  available_limit: number;
  used_limit: number;

  closing_day: number | null;
  due_day: number | null;

  color: string | null;
  notes: string | null;

  active: boolean;

  created_at?: string;
  updated_at?: string;
}

export interface CreditCardFormData {
  name: string;
  bankAccountId: string;
  brand: string;

  finalDigits: string;
  holderName: string;

  limitTotal: number;

  closingDay: number;
  dueDay: number;

  color: string;
  notes: string;
}
