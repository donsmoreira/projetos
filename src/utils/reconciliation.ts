import type { BankTransaction } from "../types/bankAccount";
import type { Payable } from "../types/payable";
import type { Receivable } from "../types/receivable";
import type { StatementLine } from "../types/statement";

export type ReconcileCandidate = {
  kind: "transaction" | "payable" | "receivable";
  id: string;
  description: string;
  /** Fornecedor/cliente (contas) ou origem (movimentação) */
  party: string;
  /** Data da movimentação ou vencimento da conta */
  date: string;
  /** Valor da movimentação (com sinal) ou total da conta (positivo) */
  value: number;
  /** Mesmo valor do extrato */
  exact: boolean;
  score: number;
};

export type ReconcileData = {
  transactions: BankTransaction[];
  /** Movimentações já ligadas a alguma linha do extrato */
  linkedIds: Set<string>;
  payables: Payable[];
  receivables: Receivable[];
};

const toCents = (value: number) => Math.round(Number(value || 0) * 100);

function daysBetween(a: string, b: string) {
  const ms = Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime());
  return Math.round(ms / 86400000);
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** O nome do fornecedor/cliente aparece no texto do extrato? */
function nameMatches(description: string, party: string) {
  const text = normalize(description);
  return normalize(party)
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 4)
    .some(word => text.includes(word));
}

function entryTotal(entry: { original_value: number; interest: number; penalty: number }) {
  return Number(entry.original_value || 0) + Number(entry.interest || 0) + Number(entry.penalty || 0);
}

/**
 * Candidatos para conciliar uma linha do extrato, do mais provável para o menos.
 * Movimentação do sistema com o mesmo valor vem primeiro; depois contas
 * pendentes com o mesmo valor; depois contas maiores (baixa parcial).
 */
export function reconcileCandidates(line: StatementLine, data: ReconcileData): ReconcileCandidate[] {
  const amountCents = toCents(line.amount);
  const absCents = Math.abs(amountCents);
  const candidates: ReconcileCandidate[] = [];

  for (const tx of data.transactions) {
    if (data.linkedIds.has(tx.id) || toCents(tx.value) !== amountCents) {
      continue;
    }

    const days = daysBetween(tx.transaction_date, line.posted_date);

    if (days > 10) {
      continue;
    }

    candidates.push({
      kind: "transaction",
      id: tx.id,
      description: tx.description,
      party: "Movimentação do sistema",
      date: tx.transaction_date,
      value: tx.value,
      exact: true,
      score: 100 - days * 3
    });
  }

  const entries =
    amountCents < 0
      ? data.payables
          .filter(item => item.status === "pendente")
          .map(item => ({ kind: "payable" as const, item, party: item.suppliers?.name ?? "" }))
      : data.receivables
          .filter(item => item.status === "pendente")
          .map(item => ({ kind: "receivable" as const, item, party: item.clients?.name ?? "" }));

  for (const { kind, item, party } of entries) {
    const totalCents = toCents(entryTotal(item));
    const exact = totalCents === absCents;
    const partial = totalCents > absCents;

    if (!exact && !partial) {
      continue;
    }

    const days = daysBetween(item.due_date, line.posted_date);
    const nameBonus = party && nameMatches(line.description, party) ? 15 : 0;
    const score = (exact ? 80 : 30) - Math.min(days, 30) + nameBonus;

    candidates.push({
      kind,
      id: item.id,
      description: item.description,
      party,
      date: item.due_date,
      value: totalCents / 100,
      exact,
      score
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

/** Melhor sugestão para mostrar direto na lista (só se o valor bater). */
export function bestSuggestion(line: StatementLine, data: ReconcileData): ReconcileCandidate | null {
  const best = reconcileCandidates(line, data)[0];
  return best && best.exact && best.score >= 55 ? best : null;
}
