import type {
  ReportDetailFilters,
  ReportDimension,
  ReportSummaryData,
  ReportTransaction
} from "../types/report";

import { getOriginLabel } from "./cashFlow";

type AccountRef = {
  id: string;
  name: string;
  parent_id: string | null;
};

export type TimeBucket = {
  key: string;
  label: string;
  entradas: number;
  saidas: number;
  /** Entradas − saídas somadas desde o início do período */
  resultadoAcumulado: number;
};

export type PieSlice = {
  key: string;
  name: string;
  value: number;
  percent: number;
};

export type GroupedBar = {
  key: string;
  name: string;
  entradas: number;
  saidas: number;
};

/** O que a pizza mostra: só saídas, só entradas, ou entradas x saídas. */
export type PieKind =
  | "despesa"
  | "receita"
  | "geral";

export const DIMENSION_LABELS: Record<ReportDimension, string> = {
  periodo: "Período (dia/mês)",
  tipo: "Entradas x saídas",
  conta_principal: "Conta gerencial principal",
  subconta: "Conta gerencial (subconta)",
  contraparte: "Fornecedor / cliente",
  lancamento: "Lançamento",
  conta: "Conta bancária / caixa",
  origem: "Origem da movimentação"
};

export const EMPTY_DETAIL_FILTERS: ReportDetailFilters = {
  accountId: "",
  managementAccountId: "",
  counterparty: "",
  origin: ""
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Até este número de dias o gráfico é por dia; acima, por mês. */
export const DAILY_LIMIT_DAYS = 62;

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function daysBetween(startDate: string, endDate: string) {
  const start = Date.UTC(+startDate.slice(0, 4), +startDate.slice(5, 7) - 1, +startDate.slice(8, 10));
  const end = Date.UTC(+endDate.slice(0, 4), +endDate.slice(5, 7) - 1, +endDate.slice(8, 10));
  return Math.round((end - start) / 86400000) + 1;
}

function nextDay(date: string) {
  const value = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + 1));
  return value.toISOString().slice(0, 10);
}

function nextMonth(month: string) {
  let year = +month.slice(0, 4);
  let index = +month.slice(5, 7) + 1;

  if (index > 12) {
    index = 1;
    year += 1;
  }

  return `${year}-${String(index).padStart(2, "0")}`;
}

export function getGranularity(startDate: string, endDate: string): "dia" | "mes" {
  return daysBetween(startDate, endDate) <= DAILY_LIMIT_DAYS ? "dia" : "mes";
}

/**
 * Totais do resumo. Transferências (banco ↔ caixa) só mudam o dinheiro
 * de lugar: aparecem na lista, mas não contam como entrada nem saída.
 */
export function summarizeTransactions(
  transactions: ReportTransaction[]
): ReportSummaryData {
  const counted = transactions.filter(transaction => !transaction.isTransfer);

  const totalIncome = round(
    counted
      .filter(transaction => transaction.type === "entrada")
      .reduce((total, transaction) => total + transaction.value, 0)
  );

  const totalExpense = round(
    counted
      .filter(transaction => transaction.type === "saida")
      .reduce((total, transaction) => total + transaction.value, 0)
  );

  return {
    totalIncome,
    totalExpense,
    balance: round(totalIncome - totalExpense),
    transactionCount: counted.length
  };
}

function getDescendants(accounts: AccountRef[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let added = true;

  while (added) {
    added = false;

    for (const account of accounts) {
      if (account.parent_id && result.has(account.parent_id) && !result.has(account.id)) {
        result.add(account.id);
        added = true;
      }
    }
  }

  return result;
}

/**
 * Aplica os filtros extras. A conta gerencial inclui as subcontas dela.
 */
export function applyDetailFilters(
  transactions: ReportTransaction[],
  filters: ReportDetailFilters,
  accounts: AccountRef[]
): ReportTransaction[] {
  const managementIds = filters.managementAccountId
    ? getDescendants(accounts, filters.managementAccountId)
    : null;

  return transactions.filter(transaction =>
    (!filters.accountId || transaction.accountId === filters.accountId) &&
    (!managementIds || (transaction.managementAccountId !== null && managementIds.has(transaction.managementAccountId))) &&
    (!filters.counterparty || transaction.counterpartyKey === filters.counterparty) &&
    (!filters.origin || transaction.transactionType === filters.origin)
  );
}

/**
 * Entradas e saídas por dia (períodos curtos) ou por mês (períodos longos),
 * com todos os dias/meses do período, mesmo os sem movimentação.
 * Transferências entre contas não entram.
 */
export function buildTimeSeries(
  transactions: ReportTransaction[],
  startDate: string,
  endDate: string
): TimeBucket[] {
  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const granularity = getGranularity(startDate, endDate);
  const buckets = new Map<string, TimeBucket>();

  if (granularity === "dia") {
    for (let day = startDate; day <= endDate; day = nextDay(day)) {
      buckets.set(day, {
        key: day,
        label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
        entradas: 0,
        saidas: 0,
        resultadoAcumulado: 0
      });
    }
  } else {
    const last = endDate.slice(0, 7);

    for (let month = startDate.slice(0, 7); month <= last; month = nextMonth(month)) {
      buckets.set(month, {
        key: month,
        label: `${MONTHS[+month.slice(5, 7) - 1]}/${month.slice(2, 4)}`,
        entradas: 0,
        saidas: 0,
        resultadoAcumulado: 0
      });
    }
  }

  for (const transaction of transactions) {
    if (transaction.isTransfer) {
      continue;
    }

    const key = granularity === "dia"
      ? transaction.date
      : transaction.date.slice(0, 7);

    const bucket = buckets.get(key);

    if (!bucket) {
      continue;
    }

    if (transaction.type === "entrada") {
      bucket.entradas += transaction.value;
    } else {
      bucket.saidas += transaction.value;
    }
  }

  let accumulated = 0;

  return [...buckets.values()].map(bucket => {
    accumulated += bucket.entradas - bucket.saidas;

    return {
      ...bucket,
      entradas: round(bucket.entradas),
      saidas: round(bucket.saidas),
      resultadoAcumulado: round(accumulated)
    };
  });
}

function getRootAccount(accounts: Map<string, AccountRef>, id: string): AccountRef | null {
  let current = accounts.get(id) ?? null;
  const seen = new Set<string>();

  while (current?.parent_id && accounts.has(current.parent_id) && !seen.has(current.id)) {
    seen.add(current.id);
    current = accounts.get(current.parent_id) ?? current;
  }

  return current;
}

/**
 * Em qual grupo a movimentação entra, para cada forma de agrupar.
 */
export function getGroup(
  transaction: ReportTransaction,
  dimension: ReportDimension,
  accountsById: Map<string, AccountRef>
): { key: string; name: string } {
  switch (dimension) {
    case "tipo":
      return transaction.type === "entrada"
        ? { key: "entrada", name: "Entradas" }
        : { key: "saida", name: "Saídas" };

    case "conta_principal":
    case "subconta": {
      if (transaction.managementAccountId) {
        const account = dimension === "conta_principal"
          ? getRootAccount(accountsById, transaction.managementAccountId)
          : accountsById.get(transaction.managementAccountId) ?? null;

        return {
          key: account?.id ?? transaction.managementAccountId,
          name: account?.name ?? transaction.managementAccountName ?? "Conta excluída"
        };
      }

      if (transaction.managementAccountName) {
        // Lançamento antigo: agrupa pela categoria em texto
        return {
          key: `categoria:${transaction.managementAccountName.toLowerCase()}`,
          name: transaction.managementAccountName
        };
      }

      return { key: "sem-conta", name: "Sem conta gerencial" };
    }

    case "contraparte":
      return transaction.counterpartyKey
        ? { key: transaction.counterpartyKey, name: transaction.counterpartyName ?? "Sem nome" }
        : { key: "sem-contraparte", name: "Sem fornecedor/cliente" };

    case "lancamento":
      return transaction.entryKey
        ? { key: transaction.entryKey, name: transaction.entryName ?? transaction.description }
        : { key: `mov:${transaction.description.toLowerCase()}`, name: transaction.description };

    case "conta":
      return {
        key: transaction.accountId ?? "sem-conta-bancaria",
        name: transaction.accountName
      };

    case "origem":
      return {
        key: transaction.transactionType,
        name: getOriginLabel(transaction.transactionType)
      };

    case "periodo":
    default:
      return { key: transaction.date.slice(0, 7), name: transaction.date.slice(0, 7) };
  }
}

/**
 * Torres agrupadas (entradas e saídas por grupo), maiores primeiro.
 * Acima de maxGroups, os menores viram "Outros".
 */
export function buildGroupedBars(
  transactions: ReportTransaction[],
  dimension: ReportDimension,
  accounts: AccountRef[],
  maxGroups = 12
): GroupedBar[] {
  const byId = new Map(accounts.map(account => [account.id, account]));
  const groups = new Map<string, GroupedBar>();

  for (const transaction of transactions) {
    if (transaction.isTransfer) {
      continue;
    }

    const { key, name } = getGroup(transaction, dimension, byId);
    const group = groups.get(key) ?? { key, name, entradas: 0, saidas: 0 };

    if (transaction.type === "entrada") {
      group.entradas += transaction.value;
    } else {
      group.saidas += transaction.value;
    }

    groups.set(key, group);
  }

  const sorted = [...groups.values()]
    .map(group => ({ ...group, entradas: round(group.entradas), saidas: round(group.saidas) }))
    .sort((a, b) => (b.entradas + b.saidas) - (a.entradas + a.saidas));

  if (sorted.length <= maxGroups) {
    return sorted;
  }

  const kept = sorted.slice(0, maxGroups - 1);
  const rest = sorted.slice(maxGroups - 1);

  return [
    ...kept,
    {
      key: "outros",
      name: `Outros (${rest.length})`,
      entradas: round(rest.reduce((sum, group) => sum + group.entradas, 0)),
      saidas: round(rest.reduce((sum, group) => sum + group.saidas, 0))
    }
  ];
}

/**
 * Fatias da pizza.
 * "despesa" soma só saídas, "receita" só entradas, "geral" compara entradas x saídas.
 * Acima de maxSlices, as menores viram "Outros".
 */
export function buildPieSlices(
  transactions: ReportTransaction[],
  accounts: AccountRef[],
  kind: PieKind,
  dimension: ReportDimension,
  maxSlices = 8
): PieSlice[] {
  const byId = new Map(accounts.map(account => [account.id, account]));
  const effectiveDimension = kind === "geral" ? "tipo" : dimension;
  const wanted = kind === "receita" ? "entrada" : kind === "despesa" ? "saida" : null;
  const totals = new Map<string, { name: string; value: number }>();

  for (const transaction of transactions) {
    if (transaction.isTransfer || (wanted && transaction.type !== wanted)) {
      continue;
    }

    const { key, name } = getGroup(transaction, effectiveDimension, byId);
    const current = totals.get(key) ?? { name, value: 0 };
    current.value += transaction.value;
    totals.set(key, current);
  }

  const sorted = [...totals.entries()]
    .map(([key, item]) => ({ key, name: item.name, value: round(item.value) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = sorted.reduce((sum, item) => sum + item.value, 0);

  let slices = sorted;

  if (sorted.length > maxSlices) {
    const kept = sorted.slice(0, maxSlices - 1);
    const rest = sorted.slice(maxSlices - 1);

    slices = [
      ...kept,
      {
        key: "outros",
        name: `Outros (${rest.length})`,
        value: round(rest.reduce((sum, item) => sum + item.value, 0))
      }
    ];
  }

  return slices.map(item => ({
    ...item,
    percent: total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0
  }));
}

/**
 * Atalhos de período a partir de uma data de referência (hoje).
 */
export function getPeriodPreset(
  preset: "hoje" | "mes" | "mes_passado" | "30dias" | "90dias" | "ano" | "ano_passado",
  today: string
): { startDate: string; endDate: string } {
  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7);
  const pad = (value: number) => String(value).padStart(2, "0");

  const minusDays = (days: number) => {
    const date = new Date(Date.UTC(year, month - 1, +today.slice(8, 10) - days));
    return date.toISOString().slice(0, 10);
  };

  const lastDay = (y: number, m: number) =>
    new Date(Date.UTC(y, m, 0)).getUTCDate();

  switch (preset) {
    case "hoje":
      return { startDate: today, endDate: today };

    case "mes":
      return { startDate: `${year}-${pad(month)}-01`, endDate: today };

    case "mes_passado": {
      const y = month === 1 ? year - 1 : year;
      const m = month === 1 ? 12 : month - 1;
      return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    }

    case "30dias":
      return { startDate: minusDays(29), endDate: today };

    case "90dias":
      return { startDate: minusDays(89), endDate: today };

    case "ano":
      return { startDate: `${year}-01-01`, endDate: today };

    case "ano_passado":
      return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
  }
}
