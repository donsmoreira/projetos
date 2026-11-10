export type ReportTransactionType =
  | "entrada"
  | "saida";

export type ReportView =
  | "descritivo"
  | "barras"
  | "linhas"
  | "pizza";

export interface ReportFiltersData {
  startDate: string;
  endDate: string;
  transactionType: "todos" | ReportTransactionType;
}

/**
 * Filtros extras, aplicados na tela sobre o relatório já gerado
 * (valem para a tabela, o resumo e todos os gráficos). Vazio = todos.
 */
export interface ReportDetailFilters {
  accountId: string;
  managementAccountId: string;
  /** "fornecedor:<id>" ou "cliente:<id>" */
  counterparty: string;
  origin: string;
}

/**
 * Como agrupar as torres e a pizza.
 */
export type ReportDimension =
  | "periodo"
  | "tipo"
  | "conta_principal"
  | "subconta"
  | "contraparte"
  | "lancamento"
  | "conta"
  | "origem";

export interface ReportTransaction {
  id: string;
  date: string;
  description: string;
  accountId: string | null;
  accountName: string;
  accountBank: string | null;
  type: ReportTransactionType;
  value: number;
  transactionType: string;
  referenceType: string | null;
  /** Transferência entre contas/caixa: não é receita nem despesa */
  isTransfer: boolean;
  managementAccountId: string | null;
  managementAccountName: string | null;
  /** Fornecedor (contas a pagar) ou cliente (contas a receber) */
  counterpartyKey: string | null;
  counterpartyName: string | null;
  /** Lançamento de origem; parcelas da mesma compra/venda ficam juntas */
  entryKey: string | null;
  entryName: string | null;
}

export interface ReportSummaryData {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  transactionCount: number;
}

export interface FinancialReportData {
  summary: ReportSummaryData;
  transactions: ReportTransaction[];
}
