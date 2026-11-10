import { useMemo } from "react";

import { X } from "lucide-react";

import type {
  ReportDetailFilters,
  ReportTransaction
} from "../../../types/report";

import type { ManagementAccount } from "../../../types/managementAccount";

import {
  buildAccountTree,
  flattenAccountTree
} from "../../../utils/accountTree";

import { getOriginLabel } from "../../../utils/cashFlow";
import { EMPTY_DETAIL_FILTERS } from "../../../utils/reportCharts";

type ReportDetailFiltersBarProps = {
  filters: ReportDetailFilters;
  transactions: ReportTransaction[];
  managementAccounts: ManagementAccount[];
  onChange: (filters: ReportDetailFilters) => void;
};

const INDENT = "   ";

function sortByName<T extends { name: string }>(items: T[]) {
  return items.sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
}

/**
 * Filtros que valem para a tabela, o resumo e todos os gráficos.
 * As opções vêm das movimentações do relatório gerado.
 */
function ReportDetailFiltersBar({
  filters,
  transactions,
  managementAccounts,
  onChange
}: ReportDetailFiltersBarProps) {
  const options = useMemo(() => {
    const accounts = new Map<string, string>();
    const suppliers = new Map<string, string>();
    const clients = new Map<string, string>();
    const origins = new Set<string>();

    for (const transaction of transactions) {
      if (transaction.accountId) {
        accounts.set(transaction.accountId, transaction.accountName);
      }

      if (transaction.counterpartyKey?.startsWith("fornecedor:")) {
        suppliers.set(transaction.counterpartyKey, transaction.counterpartyName ?? "Sem nome");
      }

      if (transaction.counterpartyKey?.startsWith("cliente:")) {
        clients.set(transaction.counterpartyKey, transaction.counterpartyName ?? "Sem nome");
      }

      origins.add(transaction.transactionType);
    }

    const toList = (map: Map<string, string>) =>
      sortByName([...map.entries()].map(([value, name]) => ({ value, name })));

    return {
      accounts: toList(accounts),
      suppliers: toList(suppliers),
      clients: toList(clients),
      origins: sortByName([...origins].map(value => ({ value, name: getOriginLabel(value) })))
    };
  }, [transactions]);

  const managementOptions = useMemo(
    () => flattenAccountTree(buildAccountTree(managementAccounts)),
    [managementAccounts]
  );

  const activeCount = Object.values(filters).filter(Boolean).length;

  function update<K extends keyof ReportDetailFilters>(field: K, value: string) {
    onChange({ ...filters, [field]: value });
  }

  return (
    <section
      className="report-detail-filters"
      aria-label="Filtrar relatório"
    >
      <div className="report-filter-field">
        <label htmlFor="report-filter-account">
          Conta / caixa
        </label>

        <select
          id="report-filter-account"
          value={filters.accountId}
          onChange={event => update("accountId", event.target.value)}
        >
          <option value="">Todas</option>
          {options.accounts.map(option => (
            <option key={option.value} value={option.value}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div className="report-filter-field">
        <label htmlFor="report-filter-management">
          Conta gerencial
        </label>

        <select
          id="report-filter-management"
          value={filters.managementAccountId}
          onChange={event => update("managementAccountId", event.target.value)}
        >
          <option value="">Todas</option>
          {managementOptions.map(option => (
            <option key={option.account.id} value={option.account.id}>
              {`${INDENT.repeat(option.depth)}${option.account.name} (${option.account.type === "receita" ? "receita" : "despesa"})`}
            </option>
          ))}
        </select>
      </div>

      <div className="report-filter-field">
        <label htmlFor="report-filter-counterparty">
          Fornecedor / cliente
        </label>

        <select
          id="report-filter-counterparty"
          value={filters.counterparty}
          onChange={event => update("counterparty", event.target.value)}
        >
          <option value="">Todos</option>

          {options.suppliers.length > 0 && (
            <optgroup label="Fornecedores">
              {options.suppliers.map(option => (
                <option key={option.value} value={option.value}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          )}

          {options.clients.length > 0 && (
            <optgroup label="Clientes">
              {options.clients.map(option => (
                <option key={option.value} value={option.value}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="report-filter-field">
        <label htmlFor="report-filter-origin">
          Origem
        </label>

        <select
          id="report-filter-origin"
          value={filters.origin}
          onChange={event => update("origin", event.target.value)}
        >
          <option value="">Todas</option>
          {options.origins.map(option => (
            <option key={option.value} value={option.value}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="report-clear-filters"
        onClick={() => onChange(EMPTY_DETAIL_FILTERS)}
        disabled={activeCount === 0}
      >
        <X size={14} />
        Limpar filtros{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
    </section>
  );
}

export default ReportDetailFiltersBar;
