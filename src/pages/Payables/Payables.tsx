import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deletePayable,
  listPayables,
  payPayablesBatch,
  renegotiatePayables,
  reversePayablePayment,
  undoPayablesRenegotiation
} from "../../services/payablesService";

import type {
  Payable
} from "../../types/payable";

import type { BatchEntry } from "../../types/entryBatch";

import SearchBar from "./components/SearchBar";
import PayableTable from "./components/PayablesTable";
import PayableModal from "./components/PayablesModal";
import PaymentModal from "./components/PaymentModal";
import SelectionBar from "../../components/EntryBatch/SelectionBar";
import BatchSettleModal from "../../components/EntryBatch/BatchSettleModal";
import RenegotiationModal from "../../components/EntryBatch/RenegotiationModal";

function toBatchEntry(payable: Payable): BatchEntry {
  return {
    id: payable.id,
    description: payable.description,
    party: payable.suppliers?.name || "Fornecedor não informado",
    partyId: payable.supplier_id,
    dueDate: payable.due_date,
    total:
      Number(payable.original_value || 0) +
      Number(payable.interest || 0) +
      Number(payable.penalty || 0),
    managementAccountId: payable.management_account_id,
    category: payable.category,
    createdAt: payable.created_at
  };
}

import { usePermissions } from "../../hooks/useCompany";

import "./Payables.css";
import { appAlert, appConfirm } from "../../components/Dialog/dialog";

function Payables() {
  const permissions = usePermissions("contas_pagar");

  const [payables, setPayables] =
    useState<Payable[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<
      "todos" | "pendente" | "pago" | "renegociada"
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

  const [isPayableModalOpen, setIsPayableModalOpen] =
    useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] =
    useState(false);

  const [selectedPayable, setSelectedPayable] =
    useState<Payable | null>(null);

  async function loadPayables() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data =
        await listPayables();

      setPayables(data);

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
          : "Não foi possível carregar as contas a pagar.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayables();
  }, []);

  const filteredPayables = useMemo(() => {
    const normalizedSearch =
      searchTerm
        .trim()
        .toLowerCase();

    return payables.filter(payable => {
      const matchesStatus =
        statusFilter === "todos" ||
        payable.status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const fields = [
        payable.suppliers?.name,
        payable.description,
        payable.category,
        payable.status,
        payable.due_date
      ];

      return fields.some(field =>
        String(field ?? "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [
    payables,
    searchTerm,
    statusFilter
  ]);

  const selectedPayables = useMemo(
    () => payables.filter(
      payable => payable.status === "pendente" && selectedIds.has(payable.id)
    ),
    [payables, selectedIds]
  );

  const selectedEntries = useMemo(
    () => selectedPayables.map(toBatchEntry),
    [selectedPayables]
  );

  const selectedTotal = useMemo(
    () => Math.round(selectedEntries.reduce((sum, entry) => sum + Math.round(entry.total * 100), 0)) / 100,
    [selectedEntries]
  );

  const canSelect =
    permissions.canSettle ||
    (permissions.canCreate && permissions.canUpdate);

  function handleToggleSelect(payable: Payable) {
    setSelectedIds(current => {
      const next = new Set(current);

      if (next.has(payable.id)) {
        next.delete(payable.id);
      } else {
        next.add(payable.id);
      }

      return next;
    });
  }

  function handleToggleAll(checked: boolean) {
    const visiblePending = filteredPayables
      .filter(payable => payable.status === "pendente")
      .map(payable => payable.id);

    setSelectedIds(current => {
      const next = new Set(current);
      visiblePending.forEach(id => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function handleOpenBatch() {
    if (selectedPayables.length === 1) {
      handleOpenPayment(selectedPayables[0]);
      return;
    }

    setIsBatchOpen(true);
  }

  async function handleOpenRenegotiation() {
    const suppliers = new Set(selectedPayables.map(payable => payable.supplier_id));

    if (suppliers.size > 1) {
      await appAlert(
        "A renegociação é feita com um fornecedor só: marque contas do mesmo fornecedor.",
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
    await loadPayables();
  }

  async function handleUndoRenegotiation(payable: Payable) {
    if (!payable.renegotiation_id) {
      return;
    }

    const newOnes = payables.filter(
      item => item.renegotiated_from === payable.renegotiation_id
    );

    const oldOnes = payables.filter(
      item => item.renegotiation_id === payable.renegotiation_id
    );

    const hasDown = newOnes.some(item => item.down_payment && item.status === "pago");

    const confirmed = await appConfirm(
      `Desfazer a renegociação? As ${newOnes.length} conta(s) criadas na renegociação serão excluídas${hasDown ? " (a entrada paga é estornada)" : ""} e as ${oldOnes.length} conta(s) antigas voltam a ficar pendentes.`,
      { title: "Desfazer renegociação", confirmLabel: "Sim", cancelLabel: "Não" }
    );

    if (!confirmed) {
      return;
    }

    try {
      await undoPayablesRenegotiation(payable.renegotiation_id);
      await loadPayables();
    } catch (error) {
      await appAlert(
        error instanceof Error
          ? error.message
          : "Não foi possível desfazer a renegociação."
      );
    }
  }

  function handleNewPayable() {
    setSelectedPayable(null);
    setIsPayableModalOpen(true);
  }

  function handleEditPayable(
    payable: Payable
  ) {
    setSelectedPayable(payable);
    setIsPayableModalOpen(true);
  }

  function handleOpenPayment(
    payable: Payable
  ) {
    setSelectedPayable(payable);
    setIsPaymentModalOpen(true);
  }

  function handleClosePayableModal() {
    setIsPayableModalOpen(false);
    setSelectedPayable(null);
  }

  function handleClosePaymentModal() {
    setIsPaymentModalOpen(false);
    setSelectedPayable(null);
  }

  async function handleDeletePayable(
    payable: Payable
  ) {
    const confirmed =
      await appConfirm(
        `Tem certeza que deseja excluir a conta "${payable.description}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deletePayable(payable.id);
      await loadPayables();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a conta.";

      await appAlert(message);
    }
  }

  async function handleReversePayment(
    payable: Payable
  ) {
    const rest = payables.find(
      item => item.partial_of === payable.id
    );

    const batch = payable.batch_id
      ? payables.filter(item => item.batch_id === payable.batch_id && item.status === "pago")
      : [];

    const confirmed =
      await appConfirm(
        batch.length > 1
          ? `"${payable.description}" foi paga em lote com outras ${batch.length - 1} conta(s). O estorno desfaz o lote inteiro (${batch.length} contas voltam a ficar pendentes). Deseja estornar?`
          : rest && rest.status === "pendente"
            ? `Deseja estornar o pagamento de "${payable.description}"? O restante em aberto ("${rest.description}") volta para esta conta.`
            : `Deseja estornar o pagamento de "${payable.description}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await reversePayablePayment(
        payable
      );

      await loadPayables();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível estornar o pagamento.";

      await appAlert(message);
    }
  }

  async function handlePayableSaved() {
    await loadPayables();
    handleClosePayableModal();
  }

  async function handlePaymentSaved() {
    await loadPayables();
    handleClosePaymentModal();
  }

  return (
    <div className="payables-page">
      <section className="payables-header">
        <div>
          <h2>Contas a Pagar</h2>

          <p>
            Gerencie despesas, vencimentos e pagamentos.
          </p>
        </div>

        {permissions.canCreate && (
<button
          type="button"
          className="payables-new-button"
          onClick={handleNewPayable}
        >
          Nova conta
        </button>
)}
      </section>

      <section className="payables-content">
        <div className="payables-filters">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
          />

          <select
            className="payables-status-filter"
            value={statusFilter}
            onChange={event =>
              setStatusFilter(
                event.target.value as
                  | "todos"
                  | "pendente"
                  | "pago"
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

            <option value="pago">
              Pagos
            </option>

            <option value="renegociada">
              Renegociadas
            </option>
          </select>
        </div>

        <SelectionBar
          count={selectedEntries.length}
          total={selectedTotal}
          settleLabel={selectedEntries.length > 1 ? "Pagar selecionadas" : "Pagar"}
          onSettle={permissions.canSettle ? handleOpenBatch : undefined}
          onRenegotiate={
            permissions.canCreate && permissions.canUpdate
              ? handleOpenRenegotiation
              : undefined
          }
          onClear={() => setSelectedIds(new Set())}
        />

        {loading && (
          <div className="payables-state">
            Carregando contas a pagar...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="payables-state payables-state-error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && (
          <PayableTable
            payables={filteredPayables}
            onEdit={permissions.canUpdate ? handleEditPayable : undefined}
            onDelete={permissions.canDelete ? handleDeletePayable : undefined}
            onPay={permissions.canSettle ? handleOpenPayment : undefined}
            onReverse={permissions.canSettle ? handleReversePayment : undefined}
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
          kind="pagar"
          entries={selectedEntries}
          onClose={() => setIsBatchOpen(false)}
          onSubmit={data => payPayablesBatch(selectedEntries.map(entry => entry.id), data)}
          onSaved={handleBatchSaved}
        />
      )}

      {isRenegotiationOpen && selectedEntries.length > 0 && (
        <RenegotiationModal
          kind="pagar"
          entries={selectedEntries}
          canSettle={permissions.canSettle}
          onClose={() => setIsRenegotiationOpen(false)}
          onSubmit={async data => {
            await renegotiatePayables(selectedEntries.map(entry => entry.id), data);
          }}
          onSaved={handleBatchSaved}
        />
      )}

      <PayableModal
        open={isPayableModalOpen}
        payable={selectedPayable}
        onClose={handleClosePayableModal}
        onSaved={handlePayableSaved}
      />

      <PaymentModal
        open={isPaymentModalOpen}
        payable={selectedPayable}
        onClose={handleClosePaymentModal}
        onSaved={handlePaymentSaved}
      />
    </div>
  );
}

export default Payables;