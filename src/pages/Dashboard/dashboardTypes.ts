export type FinancialVariant =
  | "payable"
  | "receivable"
  | "neutral";

export type FinancialSummary = {
  label: string;
  value: number;
  variant: FinancialVariant;
};

export type PayableItem = {
  id: string;
  supplier: string;
  description: string;
  dueDate: string;
  value: number;
};

export type ReceivableItem = {
  id: string;
  client: string;
  description: string;
  dueDate: string;
  value: number;
};

export type BankAccountItem = {
  id: string;
  account: string;
  bank: string;
  balance: number;
};

export type DashboardData = {
  summary: FinancialSummary[];
  upcomingPayables: PayableItem[];
  upcomingReceivables: ReceivableItem[];
  bankAccounts: BankAccountItem[];
};