export type StatementLineStatus = "pendente" | "conciliado" | "ignorado";

export type ReconcileKind = "transaction" | "payable" | "receivable" | "created";

/** Linha do extrato do banco (importada de arquivo ou do Open Finance). */
export interface StatementLine {
  id: string;
  bank_account_id: string;
  source: "ofx" | "csv" | "openfinance";
  external_id: string;
  posted_date: string;
  amount: number;
  description: string;
  status: StatementLineStatus;
  reconcile_kind: ReconcileKind | null;
  payable_id: string | null;
  receivable_id: string | null;
  bank_transaction_id: string | null;
  import_id: string | null;
  created_at: string;
  reconciled_at: string | null;
}

export type ImportResult = {
  inserted: number;
  duplicates: number;
};
