import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Pencil,
  Trash2
} from "lucide-react";

import {
  deleteBankAccount,
  deleteBankTransaction,
  deleteTransfer,
  listAccountsWithBalance,
  listBankTransactions
} from "../../services/bankAccountsService";

import type {
  AccountWithBalance,
  BankTransaction
} from "../../types/bankAccount";

import Modal from "../../components/Modal/Modal";
import { formatCurrency } from "../../utils/currency";
import {
  buildCashFlow,
  getOriginLabel
} from "../../utils/cashFlow";

import CashForm from "./components/CashForm";
import CashMovementForm from "./components/CashMovementForm";
import type { MovementKind } from "./components/CashMovementForm";

import "./Cash.css";

type ModalState =
  | { kind: "cash"; cash: AccountWithBalance | null }
  | { kind: "movement"; cash: AccountWithBalance; movement: MovementKind }
  | null;

function toISODate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split("T")[0];
}

function getMonthStart() {
  const today = new Date();
  return toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function fetchAccounts(): Promise<[AccountWithBalance[], AccountWithBalance[]]> {
  return Promise.all([
    listAccountsWithBalance("caixa"),
    listAccountsWithBalance("banco")
  ]);
}

function Cash() {
  const [cashAccounts, setCashAccounts] =
    useState<AccountWithBalance[]>([]);

  const [bankAccounts, setBankAccounts] =
    useState<AccountWithBalance[]>([]);

  const [selectedId, setSelectedId] =
    useState("");

  const [transactions, setTransactions] =
    useState<BankTransaction[]>([]);

  const [startDate, setStartDate] =
    useState(getMonthStart());

  const [endDate, setEndDate] =
    useState(toISODate(new Date()));

  const [loading, setLoading] =
    useState(true);

  const [loadingFlow, setLoadingFlow] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [modal, setModal] =
    useState<ModalState>(null);

  const applyAccounts = useCallback((
    [cash, banks]: [AccountWithBalance[], AccountWithBalance[]]
  ) => {
    setCashAccounts(cash);
    setBankAccounts(banks);
    setSelectedId(current =>
      cash.some(account => account.id === current)
        ? current
        : cash[0]?.id ?? ""
    );
  }, []);

  const loadAccounts = useCallback(async () => {
    applyAccounts(await fetchAccounts());
  }, [applyAccounts]);

  useEffect(() => {
    let active = true;

    fetchAccounts()
      .then(data => {
        if (active) {
          applyAccounts(data);
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(getErrorMessage(error, "Não foi possível carregar os caixas."));
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
  }, [applyAccounts]);

  const loadFlow = useCallback(async (cashId: string) => {
    if (!cashId) {
      setTransactions([]);
      return;
    }

    setLoadingFlow(true);

    try {
      setTransactions(await listBankTransactions(cashId));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Não foi possível carregar o fluxo de caixa."));
    } finally {
      setLoadingFlow(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (!selectedId) {
      return;
    }

    listBankTransactions(selectedId)
      .then(data => {
        if (active) {
          setTransactions(data);
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(getErrorMessage(error, "Não foi possível carregar o fluxo de caixa."));
        }
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  const selectedCash = cashAccounts.find(
    account => account.id === selectedId
  );

  const flow = useMemo(() => {
    if (!selectedCash || startDate > endDate) {
      return null;
    }

    return buildCashFlow(
      selectedCash.initial_balance,
      transactions,
      startDate,
      endDate
    );
  }, [selectedCash, transactions, startDate, endDate]);

  const totalCash = cashAccounts.reduce(
    (total, account) => total + account.balance,
    0
  );

  async function refreshAll() {
    await loadAccounts();
    await loadFlow(selectedId);
  }

  async function handleSaved() {
    setModal(null);
    await refreshAll();
  }

  async function handleDeleteCash(cash: AccountWithBalance) {
    if (cash.transactionCount > 0) {
      window.alert(
        `O caixa "${cash.name}" já tem ${cash.transactionCount} movimentações e não pode ser excluído. Assim o histórico do fluxo de caixa fica preservado.`
      );
      return;
    }

    if (!window.confirm(`Deseja realmente excluir o caixa "${cash.name}"?`)) {
      return;
    }

    try {
      await deleteBankAccount(cash.id);
      await loadAccounts();
    } catch (error) {
      window.alert(getErrorMessage(error, "Não foi possível excluir o caixa."));
    }
  }

  async function handleDeleteMovement(transaction: BankTransaction) {
    const isTransfer = transaction.transaction_type === "transfer";

    const message = isTransfer
      ? `Desfazer a transferência "${transaction.description}"? As duas pontas (caixa e banco) serão apagadas.`
      : `Excluir a movimentação "${transaction.description}"?`;

    if (!window.confirm(message)) {
      return;
    }

    try {
      if (isTransfer && transaction.reference_id) {
        await deleteTransfer(transaction.reference_id);
      } else {
        await deleteBankTransaction(transaction.id);
      }

      await refreshAll();
    } catch (error) {
      window.alert(getErrorMessage(error, "Não foi possível excluir a movimentação."));
    }
  }

  return (
    <div className="cash-page">
      <section className="cash-header">
        <div>
          <h2>Caixa</h2>

          <p>
            Dinheiro físico: saldo, entradas, saídas e fluxo de caixa.
          </p>
        </div>

        <button
          type="button"
          className="cash-new-button"
          onClick={() => setModal({ kind: "cash", cash: null })}
        >
          Novo caixa
        </button>
      </section>

      {loading && (
        <div className="cash-state">
          Carregando caixas...
        </div>
      )}

      {!loading && errorMessage && (
        <div className="cash-state cash-state-error">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && cashAccounts.length === 0 && (
        <div className="cash-state">
          <Banknote size={32} />

          <h3>Nenhum caixa cadastrado</h3>

          <p>
            Cadastre um caixa (ex.: "Caixa principal" ou "Carteira") para lançar pagamentos e recebimentos em dinheiro.
          </p>

          <button
            type="button"
            className="cash-new-button"
            onClick={() => setModal({ kind: "cash", cash: null })}
          >
            Cadastrar primeiro caixa
          </button>
        </div>
      )}

      {!loading && !errorMessage && cashAccounts.length > 0 && (
        <>
          <section className="cash-cards">
            {cashAccounts.map(cash => (
              <article
                key={cash.id}
                className={`cash-card ${cash.id === selectedId ? "is-selected" : ""}`}
              >
                <button
                  type="button"
                  className="cash-card-main"
                  onClick={() => setSelectedId(cash.id)}
                  aria-pressed={cash.id === selectedId}
                >
                  <span className="cash-card-icon">
                    <Banknote size={20} />
                  </span>

                  <span className="cash-card-info">
                    <span className="cash-card-name">{cash.name}</span>
                    <strong className={cash.balance > 0 ? "" : "is-empty"}>
                      {formatCurrency(cash.balance)}
                    </strong>
                    <small>
                      {cash.transactionCount} {cash.transactionCount === 1 ? "movimentação" : "movimentações"}
                    </small>
                  </span>
                </button>

                <div className="cash-card-actions">
                  <button
                    type="button"
                    className="cash-action cash-action-in"
                    onClick={() => setModal({ kind: "movement", cash, movement: "entrada" })}
                  >
                    <ArrowDownLeft size={15} /> Entrada
                  </button>

                  <button
                    type="button"
                    className="cash-action cash-action-out"
                    onClick={() => setModal({ kind: "movement", cash, movement: "saida" })}
                  >
                    <ArrowUpRight size={15} /> Saída
                  </button>

                  <button
                    type="button"
                    className="cash-action"
                    onClick={() => setModal({ kind: "movement", cash, movement: "transferencia" })}
                  >
                    <ArrowLeftRight size={15} /> Transferir
                  </button>

                  <button
                    type="button"
                    className="cash-icon-button"
                    onClick={() => setModal({ kind: "cash", cash })}
                    title="Editar caixa"
                    aria-label={`Editar ${cash.name}`}
                  >
                    <Pencil size={15} />
                  </button>

                  <button
                    type="button"
                    className="cash-icon-button cash-icon-danger"
                    onClick={() => handleDeleteCash(cash)}
                    title="Excluir caixa"
                    aria-label={`Excluir ${cash.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}

            {cashAccounts.length > 1 && (
              <article className="cash-card cash-card-total">
                <span className="cash-card-name">Total em dinheiro</span>
                <strong>{formatCurrency(totalCash)}</strong>
                <small>{cashAccounts.length} caixas</small>
              </article>
            )}
          </section>

          {selectedCash && (
            <section className="cash-flow">
              <header className="cash-flow-header">
                <div>
                  <h3>Fluxo de caixa · {selectedCash.name}</h3>
                  <p>Saldo anterior, entradas, saídas e saldo depois de cada movimentação.</p>
                </div>

                <div className="cash-flow-period">
                  <label>
                    De
                    <input
                      type="date"
                      value={startDate}
                      onChange={event => setStartDate(event.target.value)}
                    />
                  </label>

                  <label>
                    Até
                    <input
                      type="date"
                      value={endDate}
                      onChange={event => setEndDate(event.target.value)}
                    />
                  </label>
                </div>
              </header>

              {startDate > endDate && (
                <div className="cash-state cash-state-error">
                  A data inicial não pode ser maior que a final.
                </div>
              )}

              {flow && (
                <>
                  <div className="cash-flow-summary">
                    <div>
                      <span>Saldo anterior</span>
                      <strong>{formatCurrency(flow.openingBalance)}</strong>
                    </div>

                    <div>
                      <span>Entradas</span>
                      <strong className="is-income">+ {formatCurrency(flow.totalIncome)}</strong>
                    </div>

                    <div>
                      <span>Saídas</span>
                      <strong className="is-expense">− {formatCurrency(flow.totalExpense)}</strong>
                    </div>

                    <div>
                      <span>Saldo final</span>
                      <strong>{formatCurrency(flow.closingBalance)}</strong>
                    </div>
                  </div>

                  {loadingFlow ? (
                    <div className="cash-state">Carregando movimentações...</div>
                  ) : flow.rows.length === 0 ? (
                    <div className="cash-state">
                      Nenhuma movimentação neste período.
                    </div>
                  ) : (
                    <div className="cash-table-wrapper">
                      <table className="cash-table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Origem</th>
                            <th className="is-number">Entrada</th>
                            <th className="is-number">Saída</th>
                            <th className="is-number">Saldo</th>
                            <th aria-label="Ações" />
                          </tr>
                        </thead>

                        <tbody>
                          {flow.rows.map(row => (
                            <tr key={row.id}>
                              <td>{formatDate(row.transaction_date)}</td>
                              <td className="cash-table-description">{row.description}</td>
                              <td>
                                <span className={`cash-origin cash-origin-${row.transaction_type}`}>
                                  {getOriginLabel(row.transaction_type)}
                                </span>
                              </td>
                              <td className="is-number is-income">
                                {row.income ? formatCurrency(row.income) : ""}
                              </td>
                              <td className="is-number is-expense">
                                {row.expense ? formatCurrency(row.expense) : ""}
                              </td>
                              <td className="is-number">
                                <strong>{formatCurrency(row.balance)}</strong>
                              </td>
                              <td className="cash-table-actions">
                                {(row.transaction_type === "manual" || row.transaction_type === "transfer") ? (
                                  <button
                                    type="button"
                                    className="cash-icon-button cash-icon-danger"
                                    onClick={() => handleDeleteMovement(row)}
                                    title={row.transaction_type === "transfer" ? "Desfazer transferência" : "Excluir movimentação"}
                                    aria-label="Excluir movimentação"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : (
                                  <span
                                    className="cash-table-locked"
                                    title="Para desfazer, use o estorno em Contas a Pagar ou Contas a Receber."
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}

      {modal?.kind === "cash" && (
        <Modal
          title={modal.cash ? "Editar caixa" : "Novo caixa"}
          subtitle="Caixa de dinheiro físico."
          onClose={() => setModal(null)}
        >
          <CashForm
            cash={modal.cash}
            existingNames={cashAccounts.map(account => account.name)}
            onCancel={() => setModal(null)}
            onSaved={handleSaved}
          />
        </Modal>
      )}

      {modal?.kind === "movement" && (
        <Modal
          title="Movimentar caixa"
          subtitle={modal.cash.name}
          onClose={() => setModal(null)}
        >
          <CashMovementForm
            cash={modal.cash}
            initialKind={modal.movement}
            otherAccounts={bankAccounts}
            onCancel={() => setModal(null)}
            onSaved={handleSaved}
          />
        </Modal>
      )}
    </div>
  );
}

export default Cash;
