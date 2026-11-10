export type ReportTransactionType =
  | "entrada"
  | "saida";

export interface ReportFiltersData {
  startDate: string;
  endDate: string;
  transactionType: "todos" | ReportTransactionType;
}

export interface ReportTransaction {
  id: string;
  date: string;
  description: string;
  accountName: string;
  accountBank: string | null;
  type: ReportTransactionType;
  value: number;
  transactionType: string;
  referenceType: string | null;
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