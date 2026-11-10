export interface CreditCard {
  id: string;
  user_id: string;
  bank_account_id: string | null;

  name: string;
  bank: string | null;
  brand: string | null;

  final_digits: string | null;
  holder_name: string | null;

  // limit_total vem da coluna credit_limit; disponível e utilizado
  // são calculados a partir das compras em aberto (card_transactions)
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
  bank: string;
  brand: string;

  finalDigits: string;
  holderName: string;

  limitTotal: number;

  closingDay: number;
  dueDay: number;

  color: string;
  notes: string;
}