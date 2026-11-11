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
import { matchesLocation } from "../../../utils/address";

import LocationFilter from "../../../components/LocationFilter/LocationFilter";

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
  /** Cada fornecedor/cliente uma vez só, com a cidade e a UF do cadastro */
  const parties = useMemo(() => {
    const map = new Map<string, { key: string; name: string; city: string | null; state: string | null }>();

    for (const transaction of transactions) {
      if (transaction.counterpartyKey && !map.has(transaction.counterpartyKey)) {
        map.set(transaction.counterpartyKey, {
          key: transaction.counterpartyKey,
          name: transaction.counterpartyName ?? "Sem nome",
          city: transaction.counterpartyCity,
          state: transaction.counterpartyState
        });
      }
    }

    return [...map.values()];
  }, [transactions]);

  const options = useMemo(() => {
    const accounts = new Map<string, string>();
    const origins = new Set<string>();

    for (const transaction of transactions) {
      if (transaction.accountId) {
        accounts.set(transaction.accountId, transaction.accountName);
      }

      origins.add(transaction.transactionType);
    }

    // Fornecedores/clientes só do estado/cidade escolhidos
    const visibleParties = parties.filter(party =>
      matchesLocation(party, filters.state, filters.city)
    );

    const toList = (items: { key: string; name: string }[]) =>
      sortByName(items.map(item => ({ value: item.key, name: item.name })));

    return {
      accounts: sortByName([...accounts.entries()].map(([value, name]) => ({ value, name }))),
      suppliers: toList(visibleParties.filter(party => party.key.startsWith("fornecedor:"))),
      clients: toList(visibleParties.filter(party => party.key.startsWith("cliente:"))),
      origins: sortByName([...origins].map(value => ({ value, name: getOriginLabel(value) })))
    };
  }, [transactions, parties, filters.state, filters.city]);

  function handleLocationChange(state: string, city: string) {
    // Se o fornecedor/cliente escolhido não é do novo estado/cidade, solta ele
    const selected = parties.find(party => party.key === filters.counterparty);
    const keepCounterparty = !selected || matchesLocation(selected, state, city);

    onChange({
      ...filters,
      state,
      city,
      counterparty: keepCounterparty ? filters.counterparty : ""
    });
  }

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

      <LocationFilter
        items={parties}
        state={filters.state}
        city={filters.city}
        onChange={handleLocationChange}
        idPrefix="report"
        fieldClassName="report-filter-field"
      />

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
