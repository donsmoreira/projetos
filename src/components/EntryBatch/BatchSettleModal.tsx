import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import Modal from "../Modal/Modal";
import AccountOptions, { AccountBalanceHint } from "../AccountOptions/AccountOptions";
import CurrencyInput from "../CurrencyInput/CurrencyInput";
import PartialSettlement from "../PartialSettlement/PartialSettlement";

import { listAccountsWithBalance } from "../../services/bankAccountsService";
import type { AccountWithBalance } from "../../types/bankAccount";
import type { BatchEntry, BatchSettleData } from "../../types/entryBatch";
import { formatCurrency } from "../../utils/currency";
import { formatDateBR, previewBatchSettlement, toCents, todayISO } from "../../utils/entryBatch";

import "./EntryBatch.css";

type BatchSettleModalProps = {
  kind: "pagar" | "receber";
  entries: BatchEntry[];
  onClose: () => void;
  onSubmit: (data: BatchSettleData) => Promise<void>;
  onSaved: () => Promise<void> | void;
};

/** Baixa várias contas marcadas numa operação só. */
function BatchSettleModal({ kind, entries, onClose, onSubmit, onSaved }: BatchSettleModalProps) {
  const isPay = kind === "pagar";
  const partyWord = isPay ? "fornecedor" : "cliente";

  const totalCents = useMemo(
    () => entries.reduce((sum, entry) => sum + toCents(entry.total), 0),
    [entries]
  );

  const sameParty = useMemo(
    () => new Set(entries.map(entry => entry.partyId ?? "")).size === 1,
    [entries]
  );

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState(totalCents / 100);
  const [notes, setNotes] = useState("");
  const [keepRestOpen, setKeepRestOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    listAccountsWithBalance()
      .then(data => {
        if (active) setAccounts(data);
      })
      .catch(error => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar as contas bancárias.");
        }
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const valueCents = toCents(value);
  const lessThanTotal = valueCents > 0 && valueCents < totalCents;
  const moreThanTotal = valueCents > totalCents;
  const mixedPartial = lessThanTotal && !sameParty;
  const selectedAccount = accounts.find(account => account.id === accountId);

  const preview = useMemo(
    () => previewBatchSettlement(entries, Math.min(valueCents, totalCents), keepRestOpen),
    [entries, valueCents, totalCents, keepRestOpen]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accountId || !selectedAccount) {
      setErrorMessage("Selecione a conta bancária ou o caixa.");
      return;
    }

    if (!date) {
      setErrorMessage(`Informe a data do ${isPay ? "pagamento" : "recebimento"}.`);
      return;
    }

    if (valueCents <= 0) {
      setErrorMessage(`Informe um valor ${isPay ? "pago" : "recebido"} maior que zero.`);
      return;
    }

    if (moreThanTotal) {
      setErrorMessage(`O valor não pode ser maior que a soma das contas marcadas (${formatCurrency(totalCents / 100)}).`);
      return;
    }

    if (mixedPartial) {
      setErrorMessage(`Com contas de ${partyWord}s diferentes, o valor precisa ser igual à soma (${formatCurrency(totalCents / 100)}).`);
      return;
    }

    if (isPay && selectedAccount.account_type === "caixa" && valueCents > toCents(selectedAccount.balance)) {
      setErrorMessage("Saldo insuficiente no caixa para este pagamento.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      await onSubmit({ accountId, date, value: valueCents / 100, notes, keepRestOpen });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível concluir a baixa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={isPay ? "Pagar contas em lote" : "Receber contas em lote"}
      subtitle={`${entries.length} contas marcadas · total ${formatCurrency(totalCents / 100)}`}
      onClose={onClose}
      width={640}
    >
      <form className="arc-form" onSubmit={handleSubmit}>
        <div className="arc-form-grid">
          <div className="arc-field arc-field-full">
            <label htmlFor="batch-account">{isPay ? "Pagar com" : "Receber em"} (conta bancária ou caixa)</label>
            <select
              id="batch-account"
              value={accountId}
              onChange={event => {
                setAccountId(event.target.value);
                setErrorMessage("");
              }}
              disabled={loadingAccounts}
              required
            >
              <option value="">{loadingAccounts ? "Carregando contas..." : "Selecione a conta ou o caixa"}</option>
              <AccountOptions accounts={accounts} />
            </select>
            <AccountBalanceHint account={selectedAccount} value={valueCents / 100} direction={isPay ? "saida" : "entrada"} />
          </div>

          <div className="arc-field">
            <label htmlFor="batch-date">Data do {isPay ? "pagamento" : "recebimento"}</label>
            <input id="batch-date" type="date" value={date} onChange={event => setDate(event.target.value)} required />
          </div>

          <div className="arc-field">
            <label htmlFor="batch-value">Valor {isPay ? "pago" : "recebido"} (R$)</label>
            <CurrencyInput
              id="batch-value"
              value={value}
              onChange={next => {
                setValue(next);
                setErrorMessage("");
              }}
              required
            />
          </div>

          {sameParty ? (
            <PartialSettlement
              total={totalCents / 100}
              value={valueCents / 100}
              keepRestOpen={keepRestOpen}
              onChange={setKeepRestOpen}
              verb={isPay ? "pago" : "recebido"}
            />
          ) : (
            <small className="arc-hint arc-field-full">
              Contas de {partyWord}s diferentes: o valor precisa ser igual à soma. Baixa parcial só com contas do mesmo {partyWord}.
            </small>
          )}

          {mixedPartial && (
            <div className="arc-form-error arc-field-full">
              Com {partyWord}s diferentes não dá para baixar valor menor que a soma ({formatCurrency(totalCents / 100)}).
            </div>
          )}

          {moreThanTotal && (
            <div className="arc-form-error arc-field-full">
              O valor é maior que a soma das contas marcadas ({formatCurrency(totalCents / 100)}).
            </div>
          )}
        </div>

        <div className="batch-preview">
          <div className="batch-preview-title">
            Como fica cada conta
            {lessThanTotal && sameParty && keepRestOpen && <small> · o valor quita da mais antiga para a mais nova</small>}
          </div>

          {preview.map(line => (
            <div key={line.entry.id} className="batch-preview-row">
              <span className="batch-preview-name">
                <strong>{line.entry.description}</strong>
                <small>{line.entry.party} · vence {formatDateBR(line.entry.dueDate)} · {formatCurrency(line.entry.total)}</small>
              </span>

              <span className={`batch-preview-result${line.paidCents === 0 ? " is-open" : ""}`}>
                {mixedPartial || moreThanTotal
                  ? "—"
                  : line.paidCents === 0
                    ? "Continua em aberto"
                    : line.restCents > 0
                      ? `${formatCurrency(line.paidCents / 100)} · resta ${formatCurrency(line.restCents / 100)}`
                      : line.discountCents > 0
                        ? `${formatCurrency(line.paidCents / 100)} · desconto ${formatCurrency(line.discountCents / 100)}`
                        : `Quitada · ${formatCurrency(line.paidCents / 100)}`}
              </span>
            </div>
          ))}
        </div>

        <div className="arc-field">
          <label htmlFor="batch-notes">Observações</label>
          <textarea id="batch-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
        </div>

        {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

        <div className="arc-form-actions">
          <button type="button" className="arc-button arc-button-secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            className="arc-button arc-button-primary"
            disabled={submitting || loadingAccounts || mixedPartial || moreThanTotal}
          >
            {submitting ? "Registrando..." : isPay ? "Confirmar pagamento" : "Confirmar recebimento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default BatchSettleModal;
