/**
 * Faturas do cartão (mesma regra das funções do banco em
 * 20261112_cartao_compras_faturas.sql):
 * - a fatura é identificada pelo mês do vencimento ("AAAA-MM-01");
 * - fecha no dia de fechamento (no mesmo mês do vencimento se o fechamento é
 *   antes do vencimento; senão, no mês anterior) e vence no dia de vencimento;
 * - compra no dia do fechamento ou depois vai para a fatura seguinte.
 */

export type InvoiceStatus = "aberta" | "fechada" | "vencida" | "paga" | "futura";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  vencida: "Vencida",
  paga: "Paga",
  futura: "Futura"
};

export interface CardPurchaseRow {
  id: string;
  transaction_date: string;
  description: string;
  value: number;
  settled: boolean;
  installment_group_id: string | null;
  installment_index: number;
  installment_count: number;
  invoice_month: string | null;
  purchase_total: number | null;
  settlement_id: string | null;
  management_account_name: string | null;
}

export interface CardSettlementRow {
  id: string;
  settlement_date: string;
  value: number;
  invoice_month: string | null;
  bank_account_id: string | null;
  notes: string | null;
}

export interface CardInvoice {
  /** "AAAA-MM-01" (mês do vencimento) */
  month: string;
  closingDate: string;
  dueDate: string;
  items: CardPurchaseRow[];
  total: number;
  /** Ainda não pago */
  open: number;
  paid: number;
  settlements: CardSettlementRow[];
  status: InvoiceStatus;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function iso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** "2026-11-12" → { y: 2026, m: 11 } */
function parts(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

/** Soma meses a "AAAA-MM-01" */
export function addMonths(month: string, count: number): string {
  const { year, month: m } = parts(month);
  const date = new Date(year, m - 1 + count, 1);
  return iso(date.getFullYear(), date.getMonth() + 1, 1);
}

export function monthStart(date: string): string {
  const { year, month } = parts(date);
  return iso(year, month, 1);
}

/** Dia do mês sem passar do último dia (31 em fevereiro vira 28/29) */
function monthDay(month: string, day: number): string {
  const { year, month: m } = parts(month);
  return iso(year, m, Math.min(day, daysInMonth(year, m)));
}

export function closingDate(closingDay: number, dueDay: number, invoiceMonth: string): string {
  const closingMonth = closingDay < dueDay ? invoiceMonth : addMonths(invoiceMonth, -1);
  return monthDay(closingMonth, closingDay);
}

export function dueDate(dueDay: number, invoiceMonth: string): string {
  return monthDay(invoiceMonth, dueDay);
}

/** Fatura em que entra uma compra feita em "date" */
export function firstInvoice(closingDay: number, dueDay: number, date: string): string {
  let candidate = addMonths(monthStart(date), -1);

  for (let i = 0; i < 5; i += 1) {
    if (date < closingDate(closingDay, dueDay, candidate)) {
      return candidate;
    }
    candidate = addMonths(candidate, 1);
  }

  return candidate;
}

/** "2026-12-01" → "Dezembro/2026" */
export function invoiceLabel(month: string, short = false): string {
  const { year, month: m } = parts(month);
  const name = new Date(year, m - 1, 1).toLocaleDateString("pt-BR", { month: short ? "short" : "long" });
  const clean = name.replace(".", "");
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}/${short ? String(year).slice(2) : year}`;
}

export function formatDay(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Monta as faturas do cartão a partir das parcelas e dos pagamentos.
 * Sempre inclui a fatura atual (mesmo vazia).
 */
export function buildInvoices(
  closingDay: number,
  dueDay: number,
  purchases: CardPurchaseRow[],
  settlements: CardSettlementRow[],
  today: string
): { invoices: CardInvoice[]; currentMonth: string } {
  const currentMonth = firstInvoice(closingDay, dueDay, today);
  const byMonth = new Map<string, CardPurchaseRow[]>();

  for (const purchase of purchases) {
    const month = purchase.invoice_month
      ? monthStart(purchase.invoice_month)
      : addMonths(firstInvoice(closingDay, dueDay, purchase.transaction_date), purchase.installment_index - 1);
    const list = byMonth.get(month) ?? [];
    list.push(purchase);
    byMonth.set(month, list);
  }

  if (!byMonth.has(currentMonth)) {
    byMonth.set(currentMonth, []);
  }

  const invoices = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => {
      const total = round(items.reduce((sum, item) => sum + item.value, 0));
      const open = round(items.filter(item => !item.settled).reduce((sum, item) => sum + item.value, 0));
      const monthSettlements = settlements.filter(item => item.invoice_month && monthStart(item.invoice_month) === month);
      const closing = closingDate(closingDay, dueDay, month);
      const due = dueDate(dueDay, month);

      let status: InvoiceStatus;

      if (total > 0 && open === 0) {
        status = "paga";
      } else if (month > currentMonth) {
        status = "futura";
      } else if (today < closing) {
        status = "aberta";
      } else if (today > due) {
        status = "vencida";
      } else {
        status = "fechada";
      }

      return {
        month,
        closingDate: closing,
        dueDate: due,
        items: [...items].sort((a, b) =>
          b.transaction_date.localeCompare(a.transaction_date) || a.description.localeCompare(b.description)
        ),
        total,
        open,
        paid: round(total - open),
        settlements: monthSettlements,
        status
      };
    });

  return { invoices, currentMonth };
}
