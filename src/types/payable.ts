export type PayableStatus =
  | "pendente"
  | "pago";

export type PayablePaymentMethod =
  | "banco"
  | null;

export interface PayableSupplier {
  id: string;
  name: string;
}

export interface PayableBankAccount {
  id: string;
  name: string;
  bank: string | null;
}

export interface Payable {
  id: string;
  user_id: string;

  supplier_id: string;
  description: string;
  category: string | null;

  original_value: number;
  interest: number;
  penalty: number;

  issue_date: string;
  due_date: string;

  notes: string | null;

  status: PayableStatus;

  payment_method: PayablePaymentMethod;
  payment_date: string | null;
  paid_value: number | null;
  payment_notes: string | null;

  bank_account_id: string | null;
  bank_transaction_id: string | null;

  card_id: string | null;
  card_transaction_id: string | null;

  installment_group_id: string | null;
  installment_index: number;
  installment_count: number;

  suppliers: PayableSupplier | null;
  bank_accounts: PayableBankAccount | null;

  created_at?: string;
  updated_at?: string;
}

export interface PayableFormData {
  supplierId: string;
  description: string;
  category: string;

  value: number;
  interest: number;
  penalty: number;

  issueDate: string;
  dueDate: string;

  notes: string;

  installmentCount: number;
}

export interface PayablePaymentData {
  bankAccountId: string;
  paymentDate: string;
  paidValue: number;
  paymentNotes: string;
}