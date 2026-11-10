type FlowTransaction = {
  id: string;
  transaction_date: string;
  description: string;
  value: number;
  transaction_type: string;
  reference_id: string | null;
  created_at?: string;
};

export type CashFlowRow<T extends FlowTransaction = FlowTransaction> = T & {
  income: number;
  expense: number;
  balance: number;
};

export type CashFlow<T extends FlowTransaction = FlowTransaction> = {
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  rows: CashFlowRow<T>[];
};

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Lançamento manual",
  payable_payment: "Pagamento",
  receivable_receipt: "Recebimento",
  transfer: "Transferência",
  card_settlement: "Fatura de cartão"
};

export function getOriginLabel(transactionType: string): string {
  return ORIGIN_LABELS[transactionType] ?? "Movimentação";
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function compare(a: FlowTransaction, b: FlowTransaction) {
  if (a.transaction_date !== b.transaction_date) {
    return a.transaction_date < b.transaction_date ? -1 : 1;
  }

  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

/**
 * Fluxo de caixa de um período:
 * saldo anterior (saldo inicial + tudo antes do início),
 * cada movimentação com o saldo depois dela, e os totais.
 */
export function buildCashFlow<T extends FlowTransaction>(
  initialBalance: number,
  transactions: T[],
  startDate: string,
  endDate: string
): CashFlow<T> {
  const sorted = [...transactions].sort(compare);

  let balance = Number(initialBalance || 0);

  for (const transaction of sorted) {
    if (transaction.transaction_date < startDate) {
      balance += Number(transaction.value || 0);
    }
  }

  const openingBalance = round(balance);
  let totalIncome = 0;
  let totalExpense = 0;

  const rows: CashFlowRow<T>[] = sorted
    .filter(transaction =>
      transaction.transaction_date >= startDate &&
      transaction.transaction_date <= endDate
    )
    .map(transaction => {
      const value = Number(transaction.value || 0);
      balance += value;

      if (value >= 0) {
        totalIncome += value;
      } else {
        totalExpense += -value;
      }

      return {
        ...transaction,
        income: value >= 0 ? round(value) : 0,
        expense: value < 0 ? round(-value) : 0,
        balance: round(balance)
      };
    });

  return {
    openingBalance,
    totalIncome: round(totalIncome),
    totalExpense: round(totalExpense),
    closingBalance: round(openingBalance + totalIncome - totalExpense),
    rows
  };
}
