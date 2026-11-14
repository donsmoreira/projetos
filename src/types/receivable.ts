import type { EntryManagementAccount } from "./payable";

export type ReceivableStatus =
  | "pendente"
  | "recebido"
  | "renegociada";

export type ReceivablePaymentMethod =
  | "banco"
  | "caixa"
  | null;

export interface ReceivableClient {
  id: string;
  name: string;
}

export interface ReceivableBankAccount {
  id: string;
  name: string;
  bank: string | null;
  account_type?: "banco" | "caixa";
}

export interface Receivable {
  id: string;
  user_id: string;

  client_id: string;
  description: string;
  category: string | null;
  management_account_id: string | null;

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

  /** Conta de origem, quando esta é o restante de uma baixa parcial */
  partial_of?: string | null;
  /** Baixada em lote junto com outras (mesmo id) */
  batch_id?: string | null;
  /** Conta antiga: renegociação para a qual foi */
  renegotiation_id?: string | null;
  /** Conta nova: renegociação que a criou */
  renegotiated_from?: string | null;
  /** Entrada de uma renegociação (já nasce recebida) */
  down_payment?: boolean;

  clients: ReceivableClient | null;
  bank_accounts: ReceivableBankAccount | null;
  management_accounts: EntryManagementAccount | null;

  created_at?: string;
  updated_at?: string;
}

export interface ReceivableFormData {
  clientId: string;
  description: string;
  /** Caminho da conta gerencial, guardado como texto (ex.: "RECEITAS › TRABALHO CLT") */
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

export interface ReceivableReceiptData {
  bankAccountId: string;
  receiptDate: string;
  receivedValue: number;
  receiptNotes: string;
  /** Valor menor que o total: true = restante fica em aberto; false = quita com desconto */
  keepRestOpen: boolean;
}
