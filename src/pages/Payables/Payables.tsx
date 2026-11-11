import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deletePayable,
  listPayables,
  reversePayablePayment
} from "../../services/payablesService";

import type {
  Payable
} from "../../types/payable";

import SearchBar from "./components/SearchBar";
import PayableTable from "./components/PayablesTable";
import PayableModal from "./components/PayablesModal";
import PaymentModal from "./components/PaymentModal";

import { usePermissions } from "../../hooks/useCompany";

import "./Payables.css";

function Payables() {
  const permissions = usePermissions();

  const [payables, setPayables] =
    useState<Payable[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<
      "todos" | "pendente" | "pago"
    >("todos");

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
      window.confirm(
        `Deseja realmente excluir a conta "${payable.description}"?`
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

      window.alert(message);
    }
  }

  async function handleReversePayment(
    payable: Payable
  ) {
    const confirmed =
      window.confirm(
        `Deseja estornar o pagamento de "${payable.description}"?`
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

      window.alert(message);
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
          </select>
        </div>

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
          />
        )}
      </section>

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