import { useCallback, useEffect, useMemo, useState } from "react";

import { Check, CheckCheck, FileUp, RotateCcw, SlidersHorizontal, Trash2, Undo2 } from "lucide-react";

import { listAccountsWithBalance, listBankTransactions } from "../../services/bankAccountsService";
import { listPayables } from "../../services/payablesService";
import { listReceivables } from "../../services/receivablesService";
import {
  deleteStatementLines,
  listReconciledTransactionIds,
  listStatementLines,
  adjustBalanceToBank,
  reconcileStatementLine,
  setStatementLineIgnored,
  undoStatementReconciliation
} from "../../services/statementService";

import { usePermissions } from "../../hooks/useCompany";
import { appAlert, appConfirm } from "../../components/Dialog/dialog";

import type { AccountWithBalance, BankTransaction } from "../../types/bankAccount";
import type { Payable } from "../../types/payable";
import type { Receivable } from "../../types/receivable";
import type { StatementLine, StatementLineStatus } from "../../types/statement";

import { formatCurrency } from "../../utils/currency";
import { addMonthsClamped, formatDateBR, todayISO } from "../../utils/entryBatch";
import { bestSuggestion } from "../../utils/reconciliation";
import type { ReconcileData } from "../../utils/reconciliation";

import ImportStatementModal from "./components/ImportStatementModal";
import ReconcileModal from "./components/ReconcileModal";
import BulkReconcileModal from "./components/BulkReconcileModal";
import OpenFinancePanel from "./components/OpenFinancePanel";
import { listBankConnections } from "../../services/openFinanceService";
import type { BankConnection } from "../../services/openFinanceService";

import "../../components/EntryBatch/EntryBatch.css";
import "./BankReconciliation.css";

type StatusFilter = StatementLineStatus | "todos";
type Tab = "conciliacao" | "extrato";

const STATUS_LABEL: Record<StatementLineStatus, string> = {
  pendente: "A conciliar",
  conciliado: "Conciliado",
  ignorado: "Ignorado"
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Avulso",
  payable_payment: "Conta a pagar",
  receivable_receipt: "Conta a receber",
  card_settlement: "Fatura de cartão",
  transfer: "Transferência",
  cash_adjustment: "Ajuste de caixa"
};

const cents = (value: number) => Math.round(Number(value || 0) * 100);

/** Conciliação bancária: extrato do banco × movimentações do sistema. */
function BankReconciliation() {
  const bankPermissions = usePermissions("contas_bancarias");
  const payPermissions = usePermissions("contas_pagar");
  const receivePermissions = usePermissions("contas_receber");

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(() => addMonthsClamped(todayISO(), -2));
  const [to, setTo] = useState(todayISO);
  const [tab, setTab] = useState<Tab>("conciliacao");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendente");

  const [lines, setLines] = useState<StatementLine[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [payables, setPayables] = useState<Payable[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [reconcileLine, setReconcileLine] = useState<StatementLine | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [busyId, setBusyId] = useState("");

  const account = accounts.find(item => item.id === accountId);

  // Contas bancárias (o extrato não vale para o caixa)
  useEffect(() => {
    let active = true;

    listAccountsWithBalance("banco")
      .then(data => {
        if (!active) return;
        setAccounts(data);
        setAccountId(current => current || data[0]?.id || "");
        if (data.length === 0) setLoading(false);
      })
      .catch(error => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar as contas.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!accountId || !from || !to) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const [lineData, txData, linked, payData, recData, accountData, connectionData] = await Promise.all([
        listStatementLines(accountId, from, to),
        listBankTransactions(accountId),
        listReconciledTransactionIds(accountId),
        payPermissions.canView ? listPayables() : Promise.resolve([] as Payable[]),
        receivePermissions.canView ? listReceivables() : Promise.resolve([] as Receivable[]),
        listAccountsWithBalance("banco"),
        listBankConnections()
      ]);

      setConnections(connectionData);

      setLines(lineData);
      setTransactions(txData);
      setLinkedIds(linked);
      setPayables(payData);
      setReceivables(recData);
      setAccounts(accountData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar a conciliação.");
    } finally {
      setLoading(false);
    }
  }, [accountId, from, to, payPermissions.canView, receivePermissions.canView]);

  // Pequena espera: trocar as datas digitando não dispara uma busca por tecla
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const data: ReconcileData = useMemo(
    () => ({ transactions, linkedIds, payables, receivables }),
    [transactions, linkedIds, payables, receivables]
  );

  const counts = useMemo(() => {
    const pending = lines.filter(line => line.status === "pendente");

    return {
      pending: pending.length,
      pendingIn: pending.filter(line => line.amount > 0).reduce((sum, line) => sum + cents(line.amount), 0) / 100,
      pendingOut: pending.filter(line => line.amount < 0).reduce((sum, line) => sum + cents(line.amount), 0) / 100,
      reconciled: lines.filter(line => line.status === "conciliado").length,
      ignored: lines.filter(line => line.status === "ignorado").length
    };
  }, [lines]);

  const visibleLines = useMemo(
    () => (statusFilter === "todos" ? lines : lines.filter(line => line.status === statusFilter)),
    [lines, statusFilter]
  );

  const suggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof bestSuggestion>>();

    for (const line of lines) {
      if (line.status === "pendente") {
        map.set(line.id, bestSuggestion(line, data));
      }
    }

    return map;
  }, [lines, data]);

  // Saldo do banco × saldo do sistema na mesma data
  const balanceCheck = useMemo(() => {
    if (!account || account.bank_balance === null || account.bank_balance === undefined || !account.bank_balance_date) {
      return null;
    }

    const date = account.bank_balance_date;
    let systemCents = cents(account.initial_balance);

    for (const tx of transactions) {
      if (tx.transaction_date <= date) {
        systemCents += cents(tx.value);
      }
    }

    const bankCents = cents(account.bank_balance);

    return {
      date,
      source: account.bank_balance_source === "openfinance" ? "Open Finance" : "arquivo OFX",
      bank: bankCents / 100,
      system: systemCents / 100,
      difference: (systemCents - bankCents) / 100
    };
  }, [account, transactions]);

  // Extrato do sistema: saldo antes do período + movimentações dia a dia
  const systemStatement = useMemo(() => {
    if (!account) {
      return { opening: 0, rows: [] as { tx: BankTransaction; balance: number }[] };
    }

    let balanceCents = cents(account.initial_balance);

    for (const tx of transactions) {
      if (tx.transaction_date < from) {
        balanceCents += cents(tx.value);
      }
    }

    const opening = balanceCents / 100;
    const rows = transactions
      .filter(tx => tx.transaction_date >= from && tx.transaction_date <= to)
      .map(tx => {
        balanceCents += cents(tx.value);
        return { tx, balance: balanceCents / 100 };
      });

    return { opening, rows };
  }, [account, transactions, from, to]);

  function describeLink(line: StatementLine) {
    if (line.reconcile_kind === "payable") {
      const item = payables.find(entry => entry.id === line.payable_id);
      return `Conta a pagar: ${item?.description ?? "—"}${item?.suppliers?.name ? ` · ${item.suppliers.name}` : ""}`;
    }

    if (line.reconcile_kind === "receivable") {
      const item = receivables.find(entry => entry.id === line.receivable_id);
      return `Conta a receber: ${item?.description ?? "—"}${item?.clients?.name ? ` · ${item.clients.name}` : ""}`;
    }

    const tx = transactions.find(entry => entry.id === line.bank_transaction_id);

    if (line.reconcile_kind === "created") {
      return `Lançado avulso: ${tx?.description ?? line.description}`;
    }

    return `Movimentação: ${tx?.description ?? "—"}`;
  }

  async function act(lineId: string, action: () => Promise<void>, fallback: string) {
    try {
      setBusyId(lineId);
      if (lineId !== "bulk") setNotice("");
      await action();
      await load();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : fallback);
    } finally {
      setBusyId("");
    }
  }

  async function handleQuickReconcile(line: StatementLine) {
    const suggestion = suggestions.get(line.id);

    if (!suggestion) {
      setReconcileLine(line);
      return;
    }

    await act(
      line.id,
      () => reconcileStatementLine(line.id, suggestion.kind, suggestion.id, true),
      "Não foi possível conciliar."
    );
  }

  async function handleUndo(line: StatementLine) {
    const message =
      line.reconcile_kind === "payable" || line.reconcile_kind === "receivable"
        ? `Desfazer a conciliação de "${line.description}"? A baixa da conta será estornada (se foi em lote, o lote inteiro) e o lançamento volta para "a conciliar".`
        : line.reconcile_kind === "created"
          ? `Desfazer a conciliação de "${line.description}"? O lançamento avulso criado será excluído e o lançamento volta para "a conciliar".`
          : `Desfazer a conciliação de "${line.description}"? A movimentação continua no sistema, só deixa de estar ligada ao extrato.`;

    if (!(await appConfirm(message, { title: "Desfazer conciliação", confirmLabel: "Sim", cancelLabel: "Não", tone: "warning" }))) {
      return;
    }

    await act(line.id, () => undoStatementReconciliation(line.id), "Não foi possível desfazer.");
  }

  // Excluir todos os "a conciliar" do período (importados por engano, por exemplo)
  async function handleDeleteAllPending() {
    const pending = lines.filter(line => line.status === "pendente");

    if (pending.length === 0) return;

    const confirmed = await appConfirm(
      `Tem certeza que deseja excluir os ${pending.length} lançamento(s) a conciliar deste período do extrato importado? ` +
        "Nada muda nas movimentações do sistema; dá para importar o arquivo de novo depois.",
      { title: "Excluir todos", confirmLabel: "Sim", cancelLabel: "Não", tone: "danger" }
    );

    if (!confirmed) return;

    await act("bulk", async () => {
      const removed = await deleteStatementLines(pending.map(line => line.id));
      setNotice(`${removed} lançamento(s) excluído(s) do extrato importado.`);
    }, "Não foi possível excluir.");
  }

  // Desfazer todas as conciliações do período, uma por uma
  async function handleUndoAll() {
    const reconciled = lines.filter(line => line.status === "conciliado");

    if (reconciled.length === 0) return;

    const settles = reconciled.filter(line => line.reconcile_kind === "payable" || line.reconcile_kind === "receivable").length;
    const created = reconciled.filter(line => line.reconcile_kind === "created").length;

    const confirmed = await appConfirm(
      `Desfazer as ${reconciled.length} conciliação(ões) deste período? Todos voltam para "a conciliar".` +
        (created > 0 ? ` ${created} lançamento(s) avulso(s) criado(s) pela conciliação serão excluídos.` : "") +
        (settles > 0 ? ` ${settles} baixa(s) de contas a pagar/receber serão estornadas.` : ""),
      { title: "Desfazer todos", confirmLabel: "Sim", cancelLabel: "Não", tone: "warning" }
    );

    if (!confirmed) return;

    setBusyId("bulk");
    setNotice("");
    const problems: string[] = [];
    let done = 0;

    for (const line of reconciled) {
      setNotice(`Desfazendo ${done + problems.length + 1} de ${reconciled.length}...`);

      try {
        await undoStatementReconciliation(line.id);
        done += 1;
      } catch (error) {
        problems.push(`${line.description}: ${error instanceof Error ? error.message : "não foi possível desfazer"}`);
      }
    }

    setBusyId("");
    setNotice(`${done} conciliação(ões) desfeita(s).`);
    await load();

    if (problems.length > 0) {
      await appAlert(`Algumas não foram desfeitas:\n${problems.join("\n")}`, { title: "Desfazer todos" });
    }
  }

  async function handleAdjustBalance() {
    if (!account || !balanceCheck) return;

    const amount = -balanceCheck.difference;
    const confirmed = await appConfirm(
      `Lançar um ajuste de ${formatCurrency(amount)} em ${formatDateBR(balanceCheck.date)} na conta "${account.name}"? ` +
        `O saldo do sistema nessa data passa de ${formatCurrency(balanceCheck.system)} para ${formatCurrency(balanceCheck.bank)}, igual ao banco. ` +
        "O ajuste aparece no extrato do sistema e pode ser excluído depois.",
      { title: "Ajustar saldo ao do banco", confirmLabel: "Sim", cancelLabel: "Não", tone: "warning" }
    );

    if (!confirmed) return;

    await act("bulk", async () => {
      const value = await adjustBalanceToBank(account.id);
      setNotice(`Ajuste de ${formatCurrency(value)} lançado: o saldo do sistema agora bate com o do banco em ${formatDateBR(balanceCheck.date)}.`);
    }, "Não foi possível ajustar o saldo.");
  }

  async function handleDelete(line: StatementLine) {
    if (!(await appConfirm(`Tem certeza que deseja excluir "${line.description}" do extrato importado?`))) {
      return;
    }

    await act(line.id, async () => {
      await deleteStatementLines([line.id]);
    }, "Não foi possível excluir.");
  }

  const canReconcileAny =
    bankPermissions.canUpdate || bankPermissions.canCreate || payPermissions.canSettle || receivePermissions.canSettle;

  return (
    <div className="reconcile-page">
      <section className="reconcile-header">
        <div>
          <h2>Conciliação Bancária</h2>
          <p>Importe o extrato do banco e confira cada lançamento com o sistema.</p>
        </div>

        {bankPermissions.canCreate && account && (
          <button type="button" className="reconcile-import-button" onClick={() => setImportOpen(true)}>
            <FileUp size={17} /> Importar extrato
          </button>
        )}
      </section>

      <section className="reconcile-content">
        <div className="reconcile-filters">
          <div className="reconcile-filter">
            <label htmlFor="reconcile-account">Conta bancária</label>
            <select id="reconcile-account" value={accountId} onChange={event => setAccountId(event.target.value)}>
              {accounts.length === 0 && <option value="">Nenhuma conta bancária</option>}
              {accounts.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.bank ? ` · ${item.bank}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="reconcile-filter">
            <label htmlFor="reconcile-from">De</label>
            <input id="reconcile-from" type="date" value={from} onChange={event => setFrom(event.target.value)} />
          </div>

          <div className="reconcile-filter">
            <label htmlFor="reconcile-to">Até</label>
            <input id="reconcile-to" type="date" value={to} onChange={event => setTo(event.target.value)} />
          </div>
        </div>

        {accounts.length === 0 && !loading && !errorMessage && (
          <div className="reconcile-state">Cadastre uma conta bancária em Controle Bancário para conciliar.</div>
        )}

        {errorMessage && <div className="reconcile-state reconcile-state-error">{errorMessage}</div>}
        {notice && <div className="reconcile-notice">{notice}</div>}

        {account && (
          <>
            <OpenFinancePanel
              key={account.id}
              account={account}
              connection={connections.find(item => item.bank_account_id === account.id)}
              canCreate={bankPermissions.canCreate}
              canDelete={bankPermissions.canDelete}
              onChanged={async (message, range) => {
                if (message) {
                  setNotice(message);
                  setStatusFilter("pendente");
                }

                if (range) {
                  if (range.from < from) setFrom(range.from);
                  if (range.to > to) setTo(range.to);
                }

                await load();
              }}
            />

            <div className="reconcile-cards">
              <div className="reconcile-card">
                <span>A conciliar</span>
                <strong>{counts.pending}</strong>
                <small>
                  <em className="reconcile-in">{formatCurrency(counts.pendingIn)}</em> ·{" "}
                  <em className="reconcile-out">{formatCurrency(counts.pendingOut)}</em>
                </small>
              </div>
              <div className="reconcile-card">
                <span>Conciliados</span>
                <strong>{counts.reconciled}</strong>
                <small>{counts.ignored > 0 ? `${counts.ignored} ignorado(s) · ` : ""}no período</small>
              </div>
              <div className="reconcile-card">
                <span>Saldo no banco</span>
                {balanceCheck ? (
                  <>
                    <strong className={balanceCheck.bank < 0 ? "reconcile-out" : ""}>{formatCurrency(balanceCheck.bank)}</strong>
                    <small>em {formatDateBR(balanceCheck.date)} · {balanceCheck.source}</small>
                  </>
                ) : (
                  <>
                    <strong>—</strong>
                    <small>importe um OFX ou sincronize o Open Finance</small>
                  </>
                )}
              </div>
              <div className={`reconcile-card${balanceCheck ? (balanceCheck.difference === 0 ? " is-match" : " is-diff") : ""}`}>
                <span>Saldo no sistema</span>
                <strong className={account.balance < 0 ? "reconcile-out" : ""}>{formatCurrency(account.balance)}</strong>
                {balanceCheck ? (
                  balanceCheck.difference === 0 ? (
                    <small className="reconcile-in">✓ bate com o banco em {formatDateBR(balanceCheck.date)}</small>
                  ) : (
                    <small>
                      em {formatDateBR(balanceCheck.date)}: {formatCurrency(balanceCheck.system)} ·{" "}
                      <em className="reconcile-out">diferença {formatCurrency(balanceCheck.difference)}</em>
                    </small>
                  )
                ) : (
                  <small>hoje</small>
                )}
              </div>
            </div>

            {balanceCheck && balanceCheck.difference !== 0 && (
              <div className="reconcile-balance-hint">
                Em {formatDateBR(balanceCheck.date)} o banco tinha {formatCurrency(balanceCheck.bank)} e o sistema{" "}
                {formatCurrency(balanceCheck.system)} (diferença de {formatCurrency(balanceCheck.difference)}).
                {counts.pending > 0
                  ? ` Concilie os ${counts.pending} lançamento(s) a conciliar (${formatCurrency(counts.pendingIn + counts.pendingOut)} no total) e confira de novo.`
                  : " Confira se há movimentações no sistema que não aparecem no banco (ou o contrário). Se estiver tudo certo, ajuste o saldo."}

                {bankPermissions.canCreate && (
                  <button
                    type="button"
                    className="reconcile-action"
                    disabled={busyId !== ""}
                    onClick={() => void handleAdjustBalance()}
                  >
                    Ajustar saldo ao do banco ({formatCurrency(-balanceCheck.difference)})
                  </button>
                )}
              </div>
            )}

            <div className="reconcile-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "conciliacao"}
                className={tab === "conciliacao" ? "is-active" : ""}
                onClick={() => setTab("conciliacao")}
              >
                Extrato do banco
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "extrato"}
                className={tab === "extrato" ? "is-active" : ""}
                onClick={() => setTab("extrato")}
              >
                Extrato do sistema
              </button>
            </div>

            {loading && <div className="reconcile-state">Carregando...</div>}

            {!loading && tab === "conciliacao" && (
              <>
                <div className="reconcile-chips">
                  <span className="reconcile-bulk-actions">
                    {statusFilter === "pendente" && counts.pending > 0 && canReconcileAny && (
                      <button
                        type="button"
                        className="reconcile-bulk-button"
                        disabled={busyId !== ""}
                        onClick={() => setBulkOpen(true)}
                        title="Conciliar de uma vez todos os lançamentos a conciliar do período"
                      >
                        <CheckCheck size={14} /> Conciliar todos ({counts.pending})
                      </button>
                    )}

                    {statusFilter === "pendente" && counts.pending > 0 && bankPermissions.canDelete && (
                      <button
                        type="button"
                        className="reconcile-bulk-danger"
                        disabled={busyId !== ""}
                        onClick={() => void handleDeleteAllPending()}
                        title="Excluir do extrato importado todos os lançamentos a conciliar do período"
                      >
                        <Trash2 size={14} /> Excluir todos ({counts.pending})
                      </button>
                    )}

                    {statusFilter === "conciliado" && counts.reconciled > 0 && canReconcileAny && (
                      <button
                        type="button"
                        className="reconcile-bulk-danger"
                        disabled={busyId !== ""}
                        onClick={() => void handleUndoAll()}
                        title="Desfazer todas as conciliações do período"
                      >
                        <Undo2 size={14} /> Desfazer todos ({counts.reconciled})
                      </button>
                    )}
                  </span>

                  {(["pendente", "conciliado", "ignorado", "todos"] as StatusFilter[]).map(status => (
                    <button
                      key={status}
                      type="button"
                      className={statusFilter === status ? "is-active" : ""}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === "todos" ? "Todos" : STATUS_LABEL[status]}
                      {status === "pendente" && counts.pending > 0 ? ` (${counts.pending})` : ""}
                    </button>
                  ))}
                </div>

                {visibleLines.length === 0 ? (
                  <div className="reconcile-empty">
                    {lines.length === 0
                      ? "Nenhum lançamento do extrato neste período. Clique em \"Importar extrato\" e escolha o arquivo OFX ou CSV do banco."
                      : statusFilter === "pendente"
                        ? "Tudo conciliado neste período."
                        : "Nada aqui neste período."}
                  </div>
                ) : (
                  <div className="reconcile-table-wrapper">
                    <table className="reconcile-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Descrição no banco</th>
                          <th className="reconcile-value-col">Valor</th>
                          <th>No sistema</th>
                          <th className="reconcile-actions-col">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLines.map(line => {
                          const suggestion = suggestions.get(line.id);
                          const busy = busyId === line.id;

                          return (
                            <tr key={line.id} className={`is-${line.status}`}>
                              <td>{formatDateBR(line.posted_date)}</td>
                              <td className="reconcile-desc" title={line.description}>{line.description}</td>
                              <td className={`reconcile-value-col ${line.amount < 0 ? "reconcile-out" : "reconcile-in"}`}>
                                {formatCurrency(line.amount)}
                              </td>
                              <td className="reconcile-match">
                                {line.status === "pendente" && (
                                  suggestion ? (
                                    <span className="reconcile-suggestion">
                                      <small>Sugestão</small>
                                      {suggestion.kind === "transaction"
                                        ? `Movimentação: ${suggestion.description}`
                                        : `${suggestion.kind === "payable" ? "Pagar" : "Receber"}: ${suggestion.description}${suggestion.party ? ` · ${suggestion.party}` : ""}`}
                                    </span>
                                  ) : (
                                    <span className="reconcile-muted">Sem sugestão automática</span>
                                  )
                                )}

                                {line.status === "conciliado" && (
                                  <span className="reconcile-linked">
                                    <CheckCheck size={14} /> {describeLink(line)}
                                  </span>
                                )}

                                {line.status === "ignorado" && <span className="reconcile-muted">Ignorado</span>}
                              </td>
                              <td className="reconcile-actions-col">
                                <div className="reconcile-actions">
                                  {line.status === "pendente" && canReconcileAny && (
                                    <>
                                      {suggestion && (
                                        <button
                                          type="button"
                                          className="reconcile-action reconcile-action-primary"
                                          disabled={busy}
                                          onClick={() => void handleQuickReconcile(line)}
                                          title="Conciliar com a sugestão"
                                        >
                                          <Check size={15} /> Conciliar
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="reconcile-action"
                                        disabled={busy}
                                        onClick={() => setReconcileLine(line)}
                                        title="Escolher o que é este lançamento"
                                      >
                                        <SlidersHorizontal size={15} /> {suggestion ? "Outra" : "Conciliar"}
                                      </button>
                                    </>
                                  )}

                                  {line.status === "conciliado" && (
                                    <button
                                      type="button"
                                      className="reconcile-action"
                                      disabled={busy}
                                      onClick={() => void handleUndo(line)}
                                      title="Desfazer a conciliação"
                                    >
                                      <Undo2 size={15} /> Desfazer
                                    </button>
                                  )}

                                  {line.status === "ignorado" && bankPermissions.canUpdate && (
                                    <button
                                      type="button"
                                      className="reconcile-action"
                                      disabled={busy}
                                      onClick={() =>
                                        void act(line.id, () => setStatementLineIgnored(line.id, false), "Não foi possível voltar.")
                                      }
                                      title="Voltar para a conciliar"
                                    >
                                      <RotateCcw size={15} /> Voltar
                                    </button>
                                  )}

                                  {line.status !== "conciliado" && bankPermissions.canDelete && (
                                    <button
                                      type="button"
                                      className="reconcile-action reconcile-action-danger"
                                      disabled={busy}
                                      onClick={() => void handleDelete(line)}
                                      title="Excluir do extrato importado"
                                      aria-label={`Excluir ${line.description}`}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {!loading && tab === "extrato" && (
              <div className="reconcile-table-wrapper">
                <table className="reconcile-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Origem</th>
                      <th className="reconcile-value-col">Valor</th>
                      <th className="reconcile-value-col">Saldo</th>
                      <th>Extrato</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="reconcile-opening">
                      <td>{formatDateBR(from)}</td>
                      <td colSpan={3}>Saldo anterior</td>
                      <td className="reconcile-value-col">{formatCurrency(systemStatement.opening)}</td>
                      <td />
                    </tr>
                    {systemStatement.rows.map(({ tx, balance }) => (
                      <tr key={tx.id}>
                        <td>{formatDateBR(tx.transaction_date)}</td>
                        <td className="reconcile-desc" title={tx.description}>{tx.description}</td>
                        <td>{SOURCE_LABEL[tx.transaction_type] ?? tx.transaction_type}</td>
                        <td className={`reconcile-value-col ${tx.value < 0 ? "reconcile-out" : "reconcile-in"}`}>
                          {formatCurrency(tx.value)}
                        </td>
                        <td className={`reconcile-value-col${balance < 0 ? " reconcile-out" : ""}`}>{formatCurrency(balance)}</td>
                        <td>
                          {linkedIds.has(tx.id)
                            ? <span className="reconcile-linked"><CheckCheck size={14} /> Conciliado</span>
                            : <span className="reconcile-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                    {systemStatement.rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="reconcile-muted">Nenhuma movimentação no período.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {importOpen && account && (
        <ImportStatementModal
          account={account}
          onClose={() => setImportOpen(false)}
          onImported={async (result, statement) => {
            setImportOpen(false);
            const dates = statement.lines.map(line => line.date).sort();

            // Mostra o período do arquivo, para as linhas aparecerem
            if (dates.length > 0) {
              if (dates[0] < from) setFrom(dates[0]);
              if (dates[dates.length - 1] > to) setTo(dates[dates.length - 1]);
            }

            setStatusFilter("pendente");
            setNotice(
              `${result.inserted} lançamento(s) importado(s)` +
                (result.duplicates > 0 ? ` · ${result.duplicates} já existiam e foram pulados` : "") +
                "."
            );
            await load();
          }}
        />
      )}

      {bulkOpen && (
        <BulkReconcileModal
          lines={lines.filter(line => line.status === "pendente")}
          data={data}
          canLink={bankPermissions.canUpdate}
          canSettlePayables={payPermissions.canSettle}
          canSettleReceivables={receivePermissions.canSettle}
          canCreate={bankPermissions.canCreate}
          onClose={() => {
            setBulkOpen(false);
            void load();
          }}
          onDone={async message => {
            setBulkOpen(false);
            setNotice(message);
            await load();
          }}
        />
      )}

      {reconcileLine && (
        <ReconcileModal
          line={reconcileLine}
          data={data}
          canSettlePayables={payPermissions.canSettle}
          canSettleReceivables={receivePermissions.canSettle}
          canCreate={bankPermissions.canCreate}
          canUpdate={bankPermissions.canUpdate}
          onClose={() => setReconcileLine(null)}
          onDone={async () => {
            setReconcileLine(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

export default BankReconciliation;
