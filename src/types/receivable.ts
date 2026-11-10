export type ReceivableStatus =
  | "pendente"
  | "recebido";

export type ReceivablePaymentMethod =
  | "banco"
  | null;

export interface ReceivableClient {
  id: string;
  name: string;
}

export interface ReceivableBankAccount {
  id: string;
  name: string;
  bank: string | null;
}

export interface Receivable {
  id: string;
  user_id: string;

  client_id: string;
  description: string;
  category: string | null;

  original_value: number;
  interest: number;
  penalty: number;

  issue_date: string;
  due_date: string;

  notes: string | null;

  status: ReceivableStatus;

  payment_method: ReceivablePaymentMethod;
  payment_date: string | null;
  receipt_date: string | null;
  received_value: number | null;
  payment_notes: string | null;

  bank_account_id: string | null;
  bank_transaction_id: string | null;

  installment_group_id: string | null;
  installment_index: number;
  installment_count: number;

  clients: ReceivableClient | null;
  bank_accounts: ReceivableBankAccount | null;

  created_at?: string;
  updated_at?: string;
}

export interface ReceivableFormData {
  clientId: string;
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

export interface ReceivableReceiptData {
  bankAccountId: string;
  receiptDate: string;
  receivedValue: number;
  receiptNotes: string;
}