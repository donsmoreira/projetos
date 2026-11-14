import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deleteReceivable,
  listReceivables,
  receiveReceivablesBatch,
  renegotiateReceivables,
  reverseReceivableReceipt,
  undoReceivablesRenegotiation
} from "../../services/receivablesService";

import type {
  Receivable
} from "../../types/receivable";

import type { BatchEntry } from "../../types/entryBatch";

import SearchBar from "./components/SearchBar";
import ReceivableTable from "./components/ReceivableTable";
import ReceivableModal from "./components/ReceivableModal";
import ReceiptModal from "./components/ReceiptModal";
import SelectionBar from "../../components/EntryBatch/SelectionBar";
import BatchSettleModal from "../../components/EntryBatch/BatchSettleModal";
import RenegotiationModal from "../../components/EntryBatch/RenegotiationModal";

function toBatchEntry(receivable: Receivable): BatchEntry {
  return {
    id: receivable.id,
    description: receivable.description,
    party: receivable.clients?.name || "Cliente não informado",
    partyId: receivable.client_id,
    dueDate: receivable.due_date,
    total:
      Number(receivable.original_value || 0) +
      Number(receivable.interest || 0) +
      Number(receivable.penalty || 0),
    managementAccountId: receivable.management_account_id,
    category: receivable.category,
    createdAt: receivable.created_at
  };
}

import { usePermissions } from "../../hooks/useCompany";

import "./Receivables.css";
import { appAlert, appConfirm } from "../../components/Dialog/dialog";

function Receivables() {
  const permissions = usePermissions("contas_receber");

  const [receivables, setReceivables] =
    useState<Receivable[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<
      "todos" | "pendente" | "recebido" | "renegociada"
    >("todos");

  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(new Set());

  const [isBatchOpen, setIsBatchOpen] =
    useState(false);

  const [isRenegotiationOpen, setIsRenegotiationOpen] =
    useState(false);

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

      // Mantém marcadas só as que continuam pendentes
      const pendingIds = new Set(
        data.filter(item => item.status === "pendente").map(item => item.id)
      );
      setSelectedIds(current =>
        new Set([...current].filter(id => pendingIds.has(id)))
      );
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

  const selectedReceivables = useMemo(
    () => receivables.filter(
      receivable => receivable.status === "pendente" && selectedIds.has(receivable.id)
    ),
    [receivables, selectedIds]
  );

  const selectedEntries = useMemo(
    () => selectedReceivables.map(toBatchEntry),
    [selectedReceivables]
  );

  const selectedTotal = useMemo(
    () => Math.round(selectedEntries.reduce((sum, entry) => sum + Math.round(entry.total * 100), 0)) / 100,
    [selectedEntries]
  );

  const canSelect =
    permissions.canSettle ||
    (permissions.canCreate && permissions.canUpdate);

  function handleToggleSelect(receivable: Receivable) {
    setSelectedIds(current => {
      const next = new Set(current);

      if (next.has(receivable.id)) {
        next.delete(receivable.id);
      } else {
        next.add(receivable.id);
      }

      return next;
    });
  }

  function handleToggleAll(checked: boolean) {
    const visiblePending = filteredReceivables
      .filter(receivable => receivable.status === "pendente")
      .map(receivable => receivable.id);

    setSelectedIds(current => {
      const next = new Set(current);
      visiblePending.forEach(id => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function handleOpenBatch() {
    if (selectedReceivables.length === 1) {
      handleOpenReceipt(selectedReceivables[0]);
      return;
    }

    setIsBatchOpen(true);
  }

  async function handleOpenRenegotiation() {
    const clients = new Set(selectedReceivables.map(receivable => receivable.client_id));

    if (clients.size > 1) {
      await appAlert(
        "A renegociação é feita com um cliente só: marque contas do mesmo cliente.",
        { title: "Renegociação" }
      );
      return;
    }

    setIsRenegotiationOpen(true);
  }

  async function handleBatchSaved() {
    setIsBatchOpen(false);
    setIsRenegotiationOpen(false);
    setSelectedIds(new Set());
    await loadReceivables();
  }

  async function handleUndoRenegotiation(receivable: Receivable) {
    if (!receivable.renegotiation_id) {
      return;
    }

    const newOnes = receivables.filter(
      item => item.renegotiated_from === receivable.renegotiation_id
    );

    const oldOnes = receivables.filter(
      item => item.renegotiation_id === receivable.renegotiation_id
    );

    const hasDown = newOnes.some(item => item.down_payment && item.status === "recebido");

    const confirmed = await appConfirm(
      `Desfazer a renegociação? As ${newOnes.length} conta(s) criadas na renegociação serão excluídas${hasDown ? " (a entrada recebida é estornada)" : ""} e as ${oldOnes.length} conta(s) antigas voltam a ficar pendentes.`,
      { title: "Desfazer renegociação", confirmLabel: "Sim", cancelLabel: "Não" }
    );

    if (!confirmed) {
      return;
    }

    try {
      await undoReceivablesRenegotiation(receivable.renegotiation_id);
      await loadReceivables();
    } catch (error) {
      await appAlert(
        error instanceof Error
          ? error.message
          : "Não foi possível desfazer a renegociação."
      );
    }
  }

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
      await appConfirm(
        `Tem certeza que deseja excluir a conta "${receivable.description}"?`
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

      await appAlert(message);
    }
  }

  async function handleReverseReceipt(
    receivable: Receivable
  ) {
    const rest = receivables.find(
      item => item.partial_of === receivable.id
    );

    const batch = receivable.batch_id
      ? receivables.filter(item => item.batch_id === receivable.batch_id && item.status === "recebido")
      : [];

    const confirmed =
      await appConfirm(
        batch.length > 1
          ? `"${receivable.description}" foi recebida em lote com outras ${batch.length - 1} conta(s). O estorno desfaz o lote inteiro (${batch.length} contas voltam a ficar pendentes). Deseja estornar?`
          : rest && rest.status === "pendente"
            ? `Deseja estornar o recebimento de "${receivable.description}"? O restante em aberto ("${rest.description}") volta para esta conta.`
            : `Deseja estornar o recebimento de "${receivable.description}"?`
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

      await appAlert(message);
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
                  | "renegociada"
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

            <option value="renegociada">
              Renegociadas
            </option>
          </select>
        </div>

        <SelectionBar
          count={selectedEntries.length}
          total={selectedTotal}
          settleLabel={selectedEntries.length > 1 ? "Receber selecionadas" : "Receber"}
          onSettle={permissions.canSettle ? handleOpenBatch : undefined}
          onRenegotiate={
            permissions.canCreate && permissions.canUpdate
              ? handleOpenRenegotiation
              : undefined
          }
          onClear={() => setSelectedIds(new Set())}
        />

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
            onUndoRenegotiation={
              permissions.canUpdate && permissions.canDelete
                ? handleUndoRenegotiation
                : undefined
            }
            selectedIds={selectedIds}
            onToggleSelect={canSelect ? handleToggleSelect : undefined}
            onToggleAll={handleToggleAll}
          />
        )}
      </section>

      {isBatchOpen && selectedEntries.length > 1 && (
        <BatchSettleModal
          kind="receber"
          entries={selectedEntries}
          onClose={() => setIsBatchOpen(false)}
          onSubmit={data => receiveReceivablesBatch(selectedEntries.map(entry => entry.id), data)}
          onSaved={handleBatchSaved}
        />
      )}

      {isRenegotiationOpen && selectedEntries.length > 0 && (
        <RenegotiationModal
          kind="receber"
          entries={selectedEntries}
          canSettle={permissions.canSettle}
          onClose={() => setIsRenegotiationOpen(false)}
          onSubmit={async data => {
            await renegotiateReceivables(selectedEntries.map(entry => entry.id), data);
          }}
          onSaved={handleBatchSaved}
        />
      )}

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