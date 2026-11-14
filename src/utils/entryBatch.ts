import type { BatchEntry } from "../types/entryBatch";

/** Reais → centavos inteiros (evita erro de arredondamento). */
export function toCents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

/** Mesma ordem do banco: vencimento mais antigo primeiro. */
export function sortForSettlement(entries: BatchEntry[]) {
  return [...entries].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate) ||
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
    a.id.localeCompare(b.id)
  );
}

export type SettlementPreviewLine = {
  entry: BatchEntry;
  /** Centavos que esta conta recebe na baixa (0 = continua em aberto) */
  paidCents: number;
  /** Centavos que ficam numa nova conta "(restante)" */
  restCents: number;
  /** Centavos perdoados (quitar com desconto) */
  discountCents: number;
};

/**
 * Prévia da baixa em lote, igual ao que o banco faz
 * (pay_payables_batch / receive_receivables_batch).
 */
export function previewBatchSettlement(
  entries: BatchEntry[],
  valueCents: number,
  keepRestOpen: boolean
): SettlementPreviewLine[] {
  const ordered = sortForSettlement(entries);
  const totalCents = ordered.reduce((sum, entry) => sum + toCents(entry.total), 0);

  if (valueCents >= totalCents || totalCents <= 0) {
    return ordered.map(entry => ({
      entry,
      paidCents: toCents(entry.total),
      restCents: 0,
      discountCents: 0
    }));
  }

  if (keepRestOpen) {
    let left = valueCents;

    return ordered.map(entry => {
      const entryCents = toCents(entry.total);
      const paid = Math.max(Math.min(left, entryCents), 0);
      left -= paid;

      return {
        entry,
        paidCents: paid,
        restCents: paid > 0 ? entryCents - paid : 0,
        discountCents: 0
      };
    });
  }

  // Quitar com desconto: proporcional, centavos que sobram na primeira
  const shares = ordered.map((entry, index) =>
    index === 0 ? 0 : Math.floor((toCents(entry.total) * valueCents) / totalCents)
  );
  shares[0] = valueCents - shares.reduce((sum, share) => sum + share, 0);

  return ordered.map((entry, index) => ({
    entry,
    paidCents: shares[index],
    restCents: 0,
    discountCents: Math.max(toCents(entry.total) - shares[index], 0)
  }));
}

/** Soma um número de meses a uma data AAAA-MM-DD, segurando no fim do mês (31/01 + 1 = 28/02). */
export function addMonthsClamped(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (!year || !month || !day) {
    return isoDate;
  }

  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  return target.toISOString().slice(0, 10);
}

export type InstallmentPreview = {
  index: number;
  dueDate: string;
  cents: number;
};

/** Parcelas da renegociação, iguais às que o banco cria (centavos que sobram na 1ª). */
export function previewInstallments(
  totalCents: number,
  installments: number,
  firstDueDate: string
): InstallmentPreview[] {
  const count = Math.max(1, Math.floor(installments));
  const each = Math.floor(totalCents / count);
  const first = totalCents - each * (count - 1);

  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    dueDate: addMonthsClamped(firstDueDate, index),
    cents: index === 0 ? first : each
  }));
}

/** Data de hoje (fuso do aparelho) no formato AAAA-MM-DD. */
export function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** AAAA-MM-DD → DD/MM/AAAA */
export function formatDateBR(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
}
