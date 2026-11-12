import { useState } from "react";
import type { FormEvent } from "react";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import { closeCashSession } from "../../../services/cashSessionService";
import { formatAccountLabel } from "../../../utils/bank";
import { formatCurrency } from "../../../utils/currency";

import type { AccountWithBalance } from "../../../types/bankAccount";
import type { CashSession } from "../../../types/cashSession";

import DifferenceConfirm from "./DifferenceConfirm";

type CloseCashFormProps = {
  cash: AccountWithBalance;
  session: CashSession;
  backofficeAccounts: AccountWithBalance[];
  bankAccounts: AccountWithBalance[];
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Fechar o caixa: contar o dinheiro (obrigatório), ver a diferença, mandar parte
 * para a retaguarda e/ou depositar no banco, e deixar o resto de reserva (troco).
 */
function CloseCashForm({
  cash,
  session,
  backofficeAccounts,
  bankAccounts,
  onCancel,
  onSaved
}: CloseCashFormProps) {
  const expected = cash.balance;

  const [counted, setCounted] = useState(0);
  const [touched, setTouched] = useState(false);
  const [toBackoffice, setToBackoffice] = useState(0);
  const [backofficeId, setBackofficeId] = useState(backofficeAccounts[0]?.id ?? "");
  const [toBank, setToBank] = useState(0);
  const [bankId, setBankId] = useState(bankAccounts[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const difference = round(counted - expected);
  const reserve = round(counted - toBackoffice - toBank);

  function changed() {
    setConfirming(false);
    setErrorMessage("");
  }

  async function send(acceptDifference: boolean) {
    try {
      setSubmitting(true);
      setErrorMessage("");
      await closeCashSession({
        sessionId: session.id,
        counted,
        expected,
        acceptDifference,
        toBackoffice,
        backofficeAccountId: toBackoffice > 0 ? backofficeId : null,
        toBank,
        bankAccountId: toBank > 0 ? bankId : null,
        notes
      });
      await onSaved();
    } catch (error) {
      setConfirming(false);
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível fechar o caixa.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!touched) {
      setErrorMessage("Conte o dinheiro do caixa e informe o valor contado (obrigatório).");
      return;
    }

    if (toBackoffice > 0 && !backofficeId) {
      setErrorMessage("Escolha o caixa de retaguarda.");
      return;
    }

    if (toBank > 0 && !bankId) {
      setErrorMessage("Escolha a conta bancária do depósito.");
      return;
    }

    if (reserve < 0) {
      setErrorMessage(
        `Retaguarda + depósito (${formatCurrency(toBackoffice + toBank)}) passam do valor contado (${formatCurrency(counted)}).`
      );
      return;
    }

    if (difference !== 0) {
      setConfirming(true);
      return;
    }

    void send(false);
  }

  return (
    <form className="arc-form" onSubmit={handleSubmit}>
      <small className="arc-hint">
        Turno aberto em {formatDateTime(session.opened_at)} com troco de {formatCurrency(session.opening_counted)}.
      </small>

      <div className="cash-summary-grid cash-summary-grid-3">
        <div>
          <span>Esperado</span>
          <strong>{formatCurrency(expected)}</strong>
          <small>Saldo do caixa no sistema</small>
        </div>

        <div>
          <span>Contado</span>
          <strong>{touched ? formatCurrency(counted) : "—"}</strong>
          <small>{touched ? "Informado" : "Informe abaixo"}</small>
        </div>

        <div>
          <span>Diferença</span>
          <strong className={!touched || difference === 0 ? "" : difference > 0 ? "is-income" : "is-expense"}>
            {touched ? formatCurrency(difference) : "—"}
          </strong>
          <small>{!touched ? "—" : difference === 0 ? "Confere" : difference > 0 ? "Sobra" : "Falta"}</small>
        </div>
      </div>

      <div className="arc-field">
        <label htmlFor="close-cash-counted">Valor contado no caixa (R$)</label>
        <CurrencyInput
          id="close-cash-counted"
          value={counted}
          onChange={value => {
            setCounted(value);
            setTouched(true);
            changed();
          }}
          required
        />
        <small className="arc-hint">Obrigatório: conte todo o dinheiro do caixa e digite o total.</small>
      </div>

      <fieldset className="cash-destination">
        <legend>Para onde vai o dinheiro</legend>

        <div className="arc-form-grid">
          <div className="arc-field">
            <label htmlFor="close-cash-backoffice">Enviar para a retaguarda</label>
            <select
              id="close-cash-backoffice"
              value={backofficeId}
              onChange={event => {
                setBackofficeId(event.target.value);
                changed();
              }}
              disabled={backofficeAccounts.length === 0}
            >
              {backofficeAccounts.length === 0 ? (
                <option value="">Nenhum caixa de retaguarda cadastrado</option>
              ) : (
                backofficeAccounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))
              )}
            </select>
          </div>

          <div className="arc-field">
            <label htmlFor="close-cash-backoffice-value">Valor (R$)</label>
            <CurrencyInput
              id="close-cash-backoffice-value"
              value={toBackoffice}
              onChange={value => {
                setToBackoffice(value);
                changed();
              }}
              disabled={backofficeAccounts.length === 0}
            />
          </div>

          <div className="arc-field">
            <label htmlFor="close-cash-bank">Depositar no banco</label>
            <select
              id="close-cash-bank"
              value={bankId}
              onChange={event => {
                setBankId(event.target.value);
                changed();
              }}
              disabled={bankAccounts.length === 0}
            >
              {bankAccounts.length === 0 ? (
                <option value="">Nenhuma conta bancária cadastrada</option>
              ) : (
                bankAccounts.map(account => (
                  <option key={account.id} value={account.id}>{formatAccountLabel(account)}</option>
                ))
              )}
            </select>
          </div>

          <div className="arc-field">
            <label htmlFor="close-cash-bank-value">Valor (R$)</label>
            <CurrencyInput
              id="close-cash-bank-value"
              value={toBank}
              onChange={value => {
                setToBank(value);
                changed();
              }}
              disabled={bankAccounts.length === 0}
            />
          </div>
        </div>

        <div className={`cash-reserve ${reserve < 0 ? "is-expense" : ""}`}>
          <span>Fica no caixa (reserva / troco para a próxima abertura)</span>
          <strong>{formatCurrency(reserve)}</strong>
        </div>
      </fieldset>

      <div className="arc-field">
        <label htmlFor="close-cash-notes">Observação (opcional)</label>
        <input
          id="close-cash-notes"
          type="text"
          value={notes}
          onChange={event => setNotes(event.target.value)}
          maxLength={200}
        />
      </div>

      {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

      {confirming ? (
        <DifferenceConfirm
          action="fechar"
          expected={expected}
          counted={counted}
          difference={difference}
          submitting={submitting}
          onBack={() => setConfirming(false)}
          onConfirm={() => void send(true)}
        />
      ) : (
        <div className="arc-form-actions">
          <button
            type="button"
            className="arc-button arc-button-secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </button>

          <button type="submit" className="arc-button arc-button-primary" disabled={submitting}>
            {submitting ? "Fechando..." : "Fechar caixa"}
          </button>
        </div>
      )}
    </form>
  );
}

export default CloseCashForm;
