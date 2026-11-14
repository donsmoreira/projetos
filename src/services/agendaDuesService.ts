import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

/** Conta a pagar ou a receber mostrada na agenda pelo vencimento. */
export interface AgendaDue {
  /** "pagar:<id>" ou "receber:<id>" (único entre os dois tipos) */
  key: string;
  id: string;
  kind: "pagar" | "receber";
  description: string;
  /** Fornecedor (a pagar) ou cliente (a receber) */
  counterparty: string | null;
  /** Aberta: original + juros + multa. Quitada: valor pago/recebido. */
  value: number;
  dueDate: string;
  /** Já paga (a pagar) ou recebida (a receber) */
  done: boolean;
  /** Em aberto e com vencimento antes de hoje */
  overdue: boolean;
  installment: string | null;
  doneDate: string | null;
}

type DueRow = {
  id: string;
  description: string;
  original_value: number | string | null;
  interest: number | string | null;
  penalty: number | string | null;
  due_date: string;
  status: string;
  installment_index: number | null;
  installment_count: number | null;
  paid_value?: number | string | null;
  received_value?: number | string | null;
  payment_date?: string | null;
  receipt_date?: string | null;
  suppliers?: { name: string } | { name: string }[] | null;
  clients?: { name: string } | { name: string }[] | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

function toDue(row: DueRow, kind: "pagar" | "receber"): AgendaDue {
  const done = kind === "pagar" ? row.status === "pago" : row.status === "recebido";
  const open = Number(row.original_value || 0) + Number(row.interest || 0) + Number(row.penalty || 0);
  const settled = kind === "pagar" ? row.paid_value : row.received_value;
  const party = kind === "pagar" ? first(row.suppliers) : first(row.clients);

  return {
    key: `${kind}:${row.id}`,
    id: row.id,
    kind,
    description: row.description,
    counterparty: party?.name ?? null,
    value: Math.round((done && settled !== null && settled !== undefined ? Number(settled) : open) * 100) / 100,
    dueDate: row.due_date,
    done,
    overdue: !done && row.due_date < todayISO(),
    installment:
      row.installment_count && row.installment_count > 1
        ? `${row.installment_index ?? 1}/${row.installment_count}`
        : null,
    doneDate: (kind === "pagar" ? row.payment_date : row.receipt_date) ?? null
  };
}

/**
 * Vencimentos de contas a pagar e/ou a receber no período (inclusive).
 * Cada tipo só é buscado se a pessoa puder ver aquela tela.
 */
export async function listAgendaDues(
  startDate: string,
  endDate: string,
  include: { payables: boolean; receivables: boolean }
): Promise<AgendaDue[]> {
  const [payables, receivables] = await Promise.all([
    include.payables
      ? supabase
        .from("payables")
        .select("id, description, original_value, interest, penalty, due_date, status, installment_index, installment_count, paid_value, payment_date, suppliers (name)")
        .neq("status", "renegociada")
        .gte("due_date", startDate)
        .lte("due_date", endDate)
      : Promise.resolve({ data: [], error: null }),
    include.receivables
      ? supabase
        .from("receivables")
        .select("id, description, original_value, interest, penalty, due_date, status, installment_index, installment_count, received_value, receipt_date, clients (name)")
        .neq("status", "renegociada")
        .gte("due_date", startDate)
        .lte("due_date", endDate)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (payables.error) {
    throw new Error(translateCompanyError(payables.error.message));
  }

  if (receivables.error) {
    throw new Error(translateCompanyError(receivables.error.message));
  }

  return [
    ...((payables.data ?? []) as unknown as DueRow[]).map(row => toDue(row, "pagar")),
    ...((receivables.data ?? []) as unknown as DueRow[]).map(row => toDue(row, "receber"))
  ].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate) ||
    // No mesmo dia: a receber antes, depois a pagar; abertas antes das quitadas
    a.kind.localeCompare(b.kind) * -1 ||
    Number(a.done) - Number(b.done)
  );
}
