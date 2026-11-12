/** Turno de um caixa de operação: abertura e (quando houver) fechamento. */
export interface CashSession {
  id: string;
  cash_account_id: string;
  status: "aberto" | "fechado";

  opened_at: string;
  opened_by: string | null;
  opening_expected: number;
  opening_counted: number;
  opening_difference: number;
  opening_notes: string | null;

  closed_at: string | null;
  closed_by: string | null;
  closing_expected: number | null;
  closing_counted: number | null;
  closing_difference: number | null;
  to_backoffice: number;
  backoffice_account_id: string | null;
  to_bank: number;
  bank_account_id: string | null;
  reserve: number | null;
  closing_notes: string | null;

  reopened_at: string | null;
  reopened_by: string | null;
}

/** Linha do relatório de quebra de caixa (cada lançamento de quebra). */
export interface CashBreak {
  id: string;
  date: string;
  createdAt: string;
  cashAccountId: string;
  cashName: string;
  /** Abertura ou fechamento do turno */
  moment: "abertura" | "fechamento";
  sessionId: string | null;
  expected: number | null;
  counted: number | null;
  /** Positivo = sobra; negativo = falta */
  difference: number;
  userId: string | null;
}
