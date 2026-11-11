import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deleteReceivable,
  listReceivables,
  reverseReceivableReceipt
} from "../../services/receivablesService";

import type {
  Receivable
} from "../../types/receivable";

import SearchBar from "./components/SearchBar";
import ReceivableTable from "./components/ReceivableTable";
import ReceivableModal from "./components/ReceivableModal";
import ReceiptModal from "./components/ReceiptModal";

import { usePermissions } from "../../hooks/useCompany";

import "./Receivables.css";

function Receivables() {
  const permissions = usePermissions("contas_receber");

  const [receivables, setReceivables] =
    useState<Receivable[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<
      "todos" | "pendente" | "recebido"
    >("todos");

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    isReceivableModalOpen,
    setIsReceivableModalOpen
  ] = useState(false);

  const [
    isReceiptModalOpen,
    setIsReceiptModalOpen
  ] = useState(false);

  const [
    selectedReceivable,
    setSelectedReceivable
  ] = useState<Receivable | null>(null);

  async function loadReceivables() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data =
        await listReceivables();

      setReceivables(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as contas a receber.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReceivables();
  }, []);

  const filteredReceivables = useMemo(() => {
    const normalizedSearch =
      searchTerm
        .trim()
        .toLowerCase();

    return receivables.filter(receivable => {
      const matchesStatus =
        statusFilter === "todos" ||
        receivable.status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const fields = [
        receivable.clients?.name,
        receivable.description,
        receivable.category,
        receivable.status,
        receivable.due_date
      ];

      return fields.some(field =>
        String(field ?? "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [
    receivables,
    searchTerm,
    statusFilter
  ]);

  function handleNewReceivable() {
    setSelectedReceivable(null);
    setIsReceivableModalOpen(true);
  }

  function handleEditReceivable(
    receivable: Receivable
  ) {
    setSelectedReceivable(receivable);
    setIsReceivableModalOpen(true);
  }

  function handleOpenReceipt(
    receivable: Receivable
  ) {
    setSelectedReceivable(receivable);
    setIsReceiptModalOpen(true);
  }

  function handleCloseReceivableModal() {
    setIsReceivableModalOpen(false);
    setSelectedReceivable(null);
  }

  function handleCloseReceiptModal() {
    setIsReceiptModalOpen(false);
    setSelectedReceivable(null);
  }

  async function handleDeleteReceivable(
    receivable: Receivable
  ) {
    const confirmed =
      window.confirm(
        `Deseja realmente excluir a conta "${receivable.description}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteReceivable(
        receivable.id
      );

      await loadReceivables();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a conta.";

      window.alert(message);
    }
  }

  async function handleReverseReceipt(
    receivable: Receivable
  ) {
    const confirmed =
      window.confirm(
        `Deseja estornar o recebimento de "${receivable.description}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await reverseReceivableReceipt(
        receivable
      );

      await loadReceivables();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível estornar o recebimento.";

      window.alert(message);
    }
  }

  async function handleReceivableSaved() {
    await loadReceivables();
    handleCloseReceivableModal();
  }

  async function handleReceiptSaved() {
    await loadReceivables();
    handleCloseReceiptModal();
  }

  return (
    <div className="receivables-page">
      <section className="receivables-header">
        <div>
          <h2>Contas a Receber</h2>

          <p>
            Gerencie receitas, vencimentos e recebimentos.
          </p>
        </div>

        {permissions.canCreate && (
<button
          type="button"
          className="receivables-new-button"
          onClick={handleNewReceivable}
        >
          Nova conta
        </button>
)}
      </section>

      <section className="receivables-content">
        <div className="receivables-filters">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
          />

          <select
            className="receivables-status-filter"
            value={statusFilter}
            onChange={event =>
              setStatusFilter(
                event.target.value as
                  | "todos"
                  | "pendente"
                  | "recebido"
              )
            }
            aria-label="Filtrar por status"
          >
            <option value="todos">
              Todos os status
            </option>

            <option value="pendente">
              Pendentes
            </option>

            <option value="recebido">
              Recebidos
            </option>
          </select>
        </div>

        {loading && (
          <div className="receivables-state">
            Carregando contas a receber...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="receivables-state receivables-state-error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && (
          <ReceivableTable
            receivables={
              filteredReceivables
            }
            onEdit={permissions.canUpdate ? handleEditReceivable : undefined}
            onDelete={permissions.canDelete ? handleDeleteReceivable : undefined}
            onReceive={permissions.canSettle ? handleOpenReceipt : undefined}
            onReverse={permissions.canSettle ? handleReverseReceipt : undefined}
          />
        )}
      </section>

      <ReceivableModal
        open={isReceivableModalOpen}
        receivable={selectedReceivable}
        onClose={
          handleCloseReceivableModal
        }
        onSaved={
          handleReceivableSaved
        }
      />

      <ReceiptModal
        open={isReceiptModalOpen}
        receivable={selectedReceivable}
        onClose={
          handleCloseReceiptModal
        }
        onSaved={
          handleReceiptSaved
        }
      />
    </div>
  );
}

export default Receivables;