export type PayableStatus =
  | "pendente"
  | "pago";

export type PayablePaymentMethod =
  | "banco"
  | "caixa"
  | "cartao"
  | null;

export interface PayableSupplier {
  id: string;
  name: string;
}

export interface PayableBankAccount {
  id: string;
  name: string;
  bank: string | null;
  account_type?: "banco" | "caixa";
}

export interface EntryManagementAccount {
  id: string;
  name: string;
  parent_id: string | null;
  type: "receita" | "despesa";
}

export interface Payable {
  id: string;
  user_id: string;

  supplier_id: string;
  description: string;
  category: string | null;
  management_account_id: string | null;

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
  management_accounts: EntryManagementAccount | null;

  created_at?: string;
  updated_at?: string;
}

export interface PayableFormData {
  supplierId: string;
  description: string;
  /** Caminho da conta gerencial, guardado como texto (ex.: "DESPESAS › INTERNET") */
  category: string;
  managementAccountId: string;

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