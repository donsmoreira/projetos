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
  Landmark,
  Lock,
  LockOpen,
  Pencil,
  RotateCcw,
  Trash2
} from "lucide-react";

import {
  deleteBankAccount,
  deleteBankTransaction,
  deleteTransfer,
  listAccountsWithBalance,
  listBankTransactions
} from "../../services/bankAccountsService";

import {
  listCashSessions,
  listOpenSessions,
  reopenCashSession
} from "../../services/cashSessionService";
import { listCompanyMembers } from "../../services/companyService";

import type {
  AccountWithBalance,
  BankTransaction
} from "../../types/bankAccount";
import type { CashSession } from "../../types/cashSession";

import Modal from "../../components/Modal/Modal";
import { formatCurrency } from "../../utils/currency";
import {
  buildCashFlow,
  getOriginLabel
} from "../../utils/cashFlow";

import CashForm from "./components/CashForm";
import CashMovementForm from "./components/CashMovementForm";
import type { MovementKind } from "./components/CashMovementForm";
import CloseCashForm from "./components/CloseCashForm";
import OpenCashForm from "./components/OpenCashForm";

import { useCompany, usePermissions } from "../../hooks/useCompany";

import "./Cash.css";
import { appAlert, appConfirm } from "../../components/Dialog/dialog";
import { confirmDelete } from "../../services/deleteGuard";

type ModalState =
  | { kind: "cash"; cash: AccountWithBalance | null }
  | { kind: "movement"; cash: AccountWithBalance; movement: MovementKind }
  | { kind: "open"; cash: AccountWithBalance }
  | { kind: "close"; cash: AccountWithBalance; session: CashSession }
  | null;

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function differenceClass(value: number | null) {
  if (!value) {
    return "";
  }

  return value > 0 ? "is-income" : "is-expense";
}

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

function fetchAccounts(): Promise<[AccountWithBalance[], AccountWithBalance[], Map<string, CashSession>]> {
  return Promise.all([
    listAccountsWithBalance("caixa"),
    listAccountsWithBalance("banco"),
    listOpenSessions()
  ]);
}

function Cash() {
  const permissions = usePermissions("caixa");
  const { active } = useCompany();
  const companyId = active?.company.id ?? "";

  const [openSessions, setOpenSessions] =
    useState<Map<string, CashSession>>(new Map());

  const [sessions, setSessions] =
    useState<CashSession[]>([]);

  const [userNames, setUserNames] =
    useState<Map<string, string>>(new Map());

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
    [cash, banks, open]: [AccountWithBalance[], AccountWithBalance[], Map<string, CashSession>]
  ) => {
    setCashAccounts(cash);
    setBankAccounts(banks);
    setOpenSessions(open);
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
      const [flowRows, sessionRows] = await Promise.all([
        listBankTransactions(cashId),
        listCashSessions(cashId)
      ]);
      setTransactions(flowRows);
      setSessions(sessionRows);
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

    Promise.all([
      listBankTransactions(selectedId),
      listCashSessions(selectedId)
    ])
      .then(([data, sessionRows]) => {
        if (active) {
          setTransactions(data);
          setSessions(sessionRows);
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

  // Nomes de quem abriu/fechou (usuários da empresa)
  useEffect(() => {
    let active = true;

    if (!companyId) {
      return;
    }

    listCompanyMembers(companyId)
      .then(members => {
        if (active) {
          setUserNames(new Map(members.map(member => [member.userId, member.fullName || member.email])));
        }
      })
      .catch(() => {
        // Sem os nomes o histórico continua funcionando
      });

    return () => {
      active = false;
    };
  }, [companyId]);

  const selectedCash = cashAccounts.find(
    account => account.id === selectedId
  );

  const backofficeAccounts = cashAccounts.filter(account => account.cash_role === "retaguarda");
  const closedSessionIds = new Set(
    sessions.filter(session => session.status === "fechado").map(session => session.id)
  );

  /** Lançamento travado: é de turno fechado ou foi criado por um fechamento */
  function isLocked(row: BankTransaction) {
    return (
      row.reference_type === "cash_closing" ||
      row.reference_type === "cash_opening" ||
      Boolean(row.cash_session_id && closedSessionIds.has(row.cash_session_id))
    );
  }
  const lastSession = sessions[0];

  function userName(id: string | null) {
    return (id && userNames.get(id)) || "—";
  }

  async function handleReopen(session: CashSession) {
    if (!await appConfirm(
      "Reabrir este fechamento? O que ele lançou (quebra de caixa, envio para a retaguarda e depósito) será desfeito e o caixa volta a ficar aberto."
    )) {
      return;
    }

    try {
      await reopenCashSession(session.id);
      await refreshAll();
    } catch (error) {
      await appAlert(getErrorMessage(error, "Não foi possível reabrir o caixa."));
    }
  }

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
      await appAlert(
        `O caixa "${cash.name}" já tem ${cash.transactionCount} movimentações e não pode ser excluído. Assim o histórico do fluxo de caixa fica preservado.`
      );
      return;
    }

    if (!await confirmDelete("bank_accounts", cash.id, `Tem certeza que deseja excluir o caixa "${cash.name}"?`)) {
      return;
    }

    try {
      await deleteBankAccount(cash.id);
      await loadAccounts();
    } catch (error) {
      await appAlert(getErrorMessage(error, "Não foi possível excluir o caixa."));
    }
  }

  async function handleDeleteMovement(transaction: BankTransaction) {
    const isTransfer = transaction.transaction_type === "transfer";

    const message = isTransfer
      ? `Desfazer a transferência "${transaction.description}"? As duas pontas (caixa e banco) serão apagadas.`
      : `Excluir a movimentação "${transaction.description}"?`;

    if (!await appConfirm(message)) {
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
      await appAlert(getErrorMessage(error, "Não foi possível excluir a movimentação."));
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

        <>{permissions.canCreate && (
<button
          type="button"
          className="cash-new-button"
          onClick={() => setModal({ kind: "cash", cash: null })}
        >
          Novo caixa
        </button>
)}</>
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

          <>{permissions.canCreate && (
<button
            type="button"
            className="cash-new-button"
            onClick={() => setModal({ kind: "cash", cash: null })}
          >
            Cadastrar primeiro caixa
          </button>
)}</>
        </div>
      )}

      {!loading && !errorMessage && cashAccounts.length > 0 && (
        <>
          <section className="cash-cards">
            {cashAccounts.map(cash => {
              const isBackoffice = cash.cash_role === "retaguarda";
              const openSession = openSessions.get(cash.id);
              // Caixa de operação só movimenta com o turno aberto
              const canMove = isBackoffice || Boolean(openSession);

              return (
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
                    {isBackoffice ? <Landmark size={20} /> : <Banknote size={20} />}
                  </span>

                  <span className="cash-card-info">
                    <span className="cash-card-name">{cash.name}</span>
                    <strong className={cash.balance > 0 ? "" : "is-empty"}>
                      {formatCurrency(cash.balance)}
                    </strong>
                    <small>
                      {cash.transactionCount} {cash.transactionCount === 1 ? "movimentação" : "movimentações"}
                    </small>
                    <span
                      className={`cash-status ${isBackoffice ? "is-backoffice" : openSession ? "is-open" : "is-closed"}`}
                    >
                      {isBackoffice ? (
                        <><Landmark size={12} /> Retaguarda</>
                      ) : openSession ? (
                        <><LockOpen size={12} /> Aberto desde {formatTime(openSession.opened_at)}</>
                      ) : (
                        <><Lock size={12} /> Fechado</>
                      )}
                    </span>
                  </span>
                </button>

                <div className="cash-card-actions">
                  {permissions.canCreate && !isBackoffice && !openSession && (
                    <button
                      type="button"
                      className="cash-action cash-action-open"
                      onClick={() => setModal({ kind: "open", cash })}
                    >
                      <LockOpen size={15} /> Abrir caixa
                    </button>
                  )}

                  <>{permissions.canCreate && canMove && (
<button
                    type="button"
                    className="cash-action cash-action-in"
                    onClick={() => setModal({ kind: "movement", cash, movement: "entrada" })}
                  >
                    <ArrowDownLeft size={15} /> Entrada
                  </button>
)}</>

                  <>{permissions.canCreate && canMove && (
<button
                    type="button"
                    className="cash-action cash-action-out"
                    onClick={() => setModal({ kind: "movement", cash, movement: "saida" })}
                  >
                    <ArrowUpRight size={15} /> Saída
                  </button>
)}</>

                  <>{permissions.canCreate && canMove && (
<button
                    type="button"
                    className="cash-action"
                    onClick={() => setModal({ kind: "movement", cash, movement: "transferencia" })}
                  >
                    <ArrowLeftRight size={15} /> Transferir
                  </button>
)}</>

                  {permissions.canCreate && openSession && (
                    <button
                      type="button"
                      className="cash-action cash-action-close"
                      onClick={() => setModal({ kind: "close", cash, session: openSession })}
                    >
                      <Lock size={15} /> Fechar caixa
                    </button>
                  )}

                  <>{permissions.canUpdate && (
<button
                    type="button"
                    className="cash-icon-button"
                    onClick={() => setModal({ kind: "cash", cash })}
                    title="Editar caixa"
                    aria-label={`Editar ${cash.name}`}
                  >
                    <Pencil size={15} />
                  </button>
)}</>

                  <>{permissions.canDelete && (
<button
                    type="button"
                    className="cash-icon-button cash-icon-danger"
                    onClick={() => handleDeleteCash(cash)}
                    title="Excluir caixa"
                    aria-label={`Excluir ${cash.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
)}</>
                </div>
              </article>
              );
            })}

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
                                {(row.transaction_type === "manual" || row.transaction_type === "transfer") && !isLocked(row) ? (
                                  <>{permissions.canDelete && (
<button
                                    type="button"
                                    className="cash-icon-button cash-icon-danger"
                                    onClick={() => handleDeleteMovement(row)}
                                    title={row.transaction_type === "transfer" ? "Desfazer transferência" : "Excluir movimentação"}
                                    aria-label="Excluir movimentação"
                                  >
                                    <Trash2 size={14} />
                                  </button>
)}</>
                                ) : (
                                  <span
                                    className="cash-table-locked"
                                    title={
                                      isLocked(row)
                                        ? "Lançamento de caixa fechado: só o administrador pode reabrir o fechamento."
                                        : "Para desfazer, use o estorno em Contas a Pagar ou Contas a Receber."
                                    }
                                  >
                                    {isLocked(row) ? <Lock size={12} /> : "—"}
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

          {selectedCash && selectedCash.cash_role === "operacao" && (
            <section className="cash-flow">
              <header className="cash-flow-header">
                <div>
                  <h3>Aberturas e fechamentos · {selectedCash.name}</h3>
                  <p>Turnos do caixa: troco conferido na abertura, contagem no fechamento e para onde foi o dinheiro.</p>
                </div>
              </header>

              {sessions.length === 0 ? (
                <div className="cash-state">
                  Este caixa ainda não foi aberto. Use "Abrir caixa" para começar o primeiro turno.
                </div>
              ) : (
                <div className="cash-table-wrapper">
                  <table className="cash-table cash-sessions-table">
                    <thead>
                      <tr>
                        <th>Abertura</th>
                        <th className="is-number">Troco</th>
                        <th>Fechamento</th>
                        <th className="is-number">Esperado</th>
                        <th className="is-number">Contado</th>
                        <th className="is-number">Diferença</th>
                        <th className="is-number">Retaguarda</th>
                        <th className="is-number">Depósito</th>
                        <th className="is-number">Reserva</th>
                        <th aria-label="Ações" />
                      </tr>
                    </thead>

                    <tbody>
                      {sessions.map(session => {
                        const isOpen = session.status === "aberto";
                        const canReopen =
                          permissions.isAdmin &&
                          !isOpen &&
                          session.id === lastSession?.id;

                        return (
                          <tr key={session.id}>
                            <td>
                              {formatDateTime(session.opened_at)}
                              <small className="cash-table-sub">{userName(session.opened_by)}</small>
                            </td>
                            <td className="is-number">
                              {formatCurrency(session.opening_counted)}
                              {session.opening_difference !== 0 && (
                                <small className={`cash-table-sub ${differenceClass(session.opening_difference)}`}>
                                  {session.opening_difference > 0 ? "sobra " : "falta "}
                                  {formatCurrency(Math.abs(session.opening_difference))}
                                </small>
                              )}
                            </td>
                            <td>
                              {isOpen ? (
                                <span className="cash-status is-open"><LockOpen size={12} /> Aberto</span>
                              ) : (
                                <>
                                  {formatDateTime(session.closed_at)}
                                  <small className="cash-table-sub">{userName(session.closed_by)}</small>
                                </>
                              )}
                            </td>
                            <td className="is-number">{isOpen ? "" : formatCurrency(session.closing_expected ?? 0)}</td>
                            <td className="is-number">{isOpen ? "" : formatCurrency(session.closing_counted ?? 0)}</td>
                            <td className={`is-number ${differenceClass(session.closing_difference)}`}>
                              {isOpen ? "" : formatCurrency(session.closing_difference ?? 0)}
                            </td>
                            <td className="is-number">{isOpen || !session.to_backoffice ? "" : formatCurrency(session.to_backoffice)}</td>
                            <td className="is-number">{isOpen || !session.to_bank ? "" : formatCurrency(session.to_bank)}</td>
                            <td className="is-number"><strong>{isOpen ? "" : formatCurrency(session.reserve ?? 0)}</strong></td>
                            <td className="cash-table-actions">
                              {canReopen && (
                                <button
                                  type="button"
                                  className="cash-icon-button"
                                  onClick={() => void handleReopen(session)}
                                  title="Reabrir este fechamento (administrador)"
                                  aria-label="Reabrir fechamento"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
            hasOpenSession={Boolean(modal.cash && openSessions.get(modal.cash.id))}
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

      {modal?.kind === "open" && (
        <Modal
          title="Abrir caixa"
          subtitle={`${modal.cash.name} · confira o troco`}
          onClose={() => setModal(null)}
        >
          <OpenCashForm
            cash={modal.cash}
            onCancel={() => setModal(null)}
            onSaved={handleSaved}
          />
        </Modal>
      )}

      {modal?.kind === "close" && (
        <Modal
          title="Fechar caixa"
          subtitle={`${modal.cash.name} · conte o dinheiro`}
          onClose={() => setModal(null)}
        >
          <CloseCashForm
            cash={modal.cash}
            session={modal.session}
            backofficeAccounts={backofficeAccounts}
            bankAccounts={bankAccounts}
            onCancel={() => setModal(null)}
            onSaved={handleSaved}
          />
        </Modal>
      )}
    </div>
  );
}

export default Cash;
