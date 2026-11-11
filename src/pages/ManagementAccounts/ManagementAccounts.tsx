import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Search,
  X
} from "lucide-react";

import {
  deleteManagementAccount,
  listManagementAccounts
} from "../../services/managementAccountsService";

import type {
  ManagementAccount,
  ManagementAccountType
} from "../../types/managementAccount";

import {
  buildAccountTree,
  filterAccountTree,
  getDescendantIds
} from "../../utils/accountTree";

import { usePermissions } from "../../hooks/useCompany";

import AccountTree from "./components/AccountTree";
import AccountModal from "./components/AccountModal";

import "./ManagementAccounts.css";

type TypeFilter = "todas" | ManagementAccountType;

const FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "receita", label: "Receitas" },
  { value: "despesa", label: "Despesas" }
];

type ModalState = {
  account: ManagementAccount | null;
  parentId: string | null;
} | null;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function ManagementAccounts() {
  const permissions = usePermissions();

  const [accounts, setAccounts] =
    useState<ManagementAccount[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [typeFilter, setTypeFilter] =
    useState<TypeFilter>("todas");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [collapsedIds, setCollapsedIds] =
    useState<Set<string>>(new Set());

  const [modal, setModal] =
    useState<ModalState>(null);

  useEffect(() => {
    let active = true;

    listManagementAccounts()
      .then(data => {
        if (active) {
          setAccounts(data);
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(
            getErrorMessage(error, "Não foi possível carregar as contas.")
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function reloadAccounts() {
    try {
      setErrorMessage("");
      setAccounts(await listManagementAccounts());
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Não foi possível carregar as contas.")
      );
    }
  }

  const tree = useMemo(() => {
    const visible = typeFilter === "todas"
      ? accounts
      : accounts.filter(account => account.type === typeFilter);

    return filterAccountTree(
      buildAccountTree(visible),
      searchTerm
    );
  }, [accounts, typeFilter, searchTerm]);

  const totals = useMemo(() => ({
    receita: accounts.filter(account => account.type === "receita").length,
    despesa: accounts.filter(account => account.type === "despesa").length,
    fixa: accounts.filter(account => account.nature === "fixa").length,
    variavel: accounts.filter(account => account.nature === "variavel").length
  }), [accounts]);

  function handleToggle(id: string) {
    setCollapsedIds(current => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function handleExpandAll() {
    setCollapsedIds(new Set());
  }

  function handleCollapseAll() {
    setCollapsedIds(
      new Set(
        accounts
          .filter(account =>
            accounts.some(child => child.parent_id === account.id)
          )
          .map(account => account.id)
      )
    );
  }

  function handleAddChild(parent: ManagementAccount) {
    // Garante que a conta pai fique aberta para ver a nova subconta
    setCollapsedIds(current => {
      const next = new Set(current);
      next.delete(parent.id);
      return next;
    });

    setModal({ account: null, parentId: parent.id });
  }

  async function handleDelete(account: ManagementAccount) {
    const descendants = getDescendantIds(accounts, account.id);

    if (descendants.size > 0) {
      window.alert(
        `A conta "${account.name}" tem ${descendants.size} ${descendants.size === 1 ? "subconta" : "subcontas"}. Exclua ou mova as subcontas para outra conta antes.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Deseja realmente excluir a conta "${account.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteManagementAccount(account.id);
      await reloadAccounts();
    } catch (error) {
      window.alert(
        getErrorMessage(error, "Não foi possível excluir a conta.")
      );
    }
  }

  async function handleSaved() {
    await reloadAccounts();
    setModal(null);
  }

  const searching = searchTerm.trim().length > 0;

  return (
    <div className="accounts-page">
      <section className="accounts-header">
        <div>
          <h2>Contas Gerenciais</h2>

          <p>
            Plano de contas de receitas e despesas, com contas principais e subcontas.
          </p>
        </div>

        {permissions.canCreate && (
          <button
            type="button"
            className="accounts-new-button"
            onClick={() => setModal({ account: null, parentId: null })}
          >
            Nova conta
          </button>
        )}
      </section>

      <section className="accounts-summary">
        <div className="accounts-summary-card">
          <span>Receitas</span>
          <strong className="accounts-summary-receita">{totals.receita}</strong>
        </div>

        <div className="accounts-summary-card">
          <span>Despesas</span>
          <strong className="accounts-summary-despesa">{totals.despesa}</strong>
        </div>

        <div className="accounts-summary-card">
          <span>Fixas</span>
          <strong>{totals.fixa}</strong>
        </div>

        <div className="accounts-summary-card">
          <span>Variáveis</span>
          <strong>{totals.variavel}</strong>
        </div>
      </section>

      <section className="accounts-content">
        <div className="accounts-toolbar">
          <div
            className="accounts-filter"
            role="tablist"
            aria-label="Filtrar por tipo"
          >
            {FILTERS.map(filter => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={typeFilter === filter.value}
                className={typeFilter === filter.value ? "is-active" : ""}
                onClick={() => setTypeFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="accounts-search">
            <Search
              size={18}
              className="accounts-search-icon"
            />

            <input
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Pesquisar conta..."
              aria-label="Pesquisar contas"
            />

            {searchTerm && (
              <button
                type="button"
                className="accounts-search-clear"
                onClick={() => setSearchTerm("")}
                title="Limpar pesquisa"
                aria-label="Limpar pesquisa"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="accounts-tree-controls">
            <button type="button" onClick={handleExpandAll}>
              Expandir tudo
            </button>

            <button type="button" onClick={handleCollapseAll}>
              Recolher tudo
            </button>
          </div>
        </div>

        {loading && (
          <div className="accounts-state">
            Carregando contas...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="accounts-state accounts-state-error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && accounts.length === 0 && (
          <div className="accounts-state">
            <h3>Nenhuma conta cadastrada</h3>

            <p>
              Comece criando uma conta principal, como "RECEITA TRABALHO", e depois as subcontas dentro dela.
            </p>
          </div>
        )}

        {!loading && !errorMessage && accounts.length > 0 && tree.length === 0 && (
          <div className="accounts-state">
            Nenhuma conta encontrada com esse filtro.
          </div>
        )}

        {!loading && !errorMessage && tree.length > 0 && (
          <AccountTree
            nodes={tree}
            collapsedIds={collapsedIds}
            forceExpanded={searching}
            onToggle={handleToggle}
            onAddChild={permissions.canCreate ? handleAddChild : undefined}
            onEdit={permissions.canUpdate ? account => setModal({ account, parentId: account.parent_id }) : undefined}
            onDelete={permissions.canDelete ? handleDelete : undefined}
          />
        )}
      </section>

      <AccountModal
        open={modal !== null}
        account={modal?.account ?? null}
        defaultParentId={modal?.parentId ?? null}
        accounts={accounts}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}

export default ManagementAccounts;
