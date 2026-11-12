import { useState } from "react";
import type { FormEvent } from "react";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import { openCashSession } from "../../../services/cashSessionService";
import { formatCurrency } from "../../../utils/currency";

import type { AccountWithBalance } from "../../../types/bankAccount";

import DifferenceConfirm from "./DifferenceConfirm";

type OpenCashFormProps = {
  cash: AccountWithBalance;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

/** Abrir o caixa conferindo o troco (a reserva que ficou no último fechamento). */
function OpenCashForm({ cash, onCancel, onSaved }: OpenCashFormProps) {
  const expected = cash.balance;

  const [counted, setCounted] = useState(0);
  const [touched, setTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const difference = Math.round((counted - expected) * 100) / 100;

  async function send(acceptDifference: boolean) {
    try {
      setSubmitting(true);
      setErrorMessage("");
      await openCashSession({
        cashAccountId: cash.id,
        counted,
        expected,
        acceptDifference,
        notes
      });
      await onSaved();
    } catch (error) {
      setConfirming(false);
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir o caixa.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!touched) {
      setErrorMessage("Conte o troco e informe o valor (obrigatório; pode ser zero).");
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
      <div className="cash-summary-grid">
        <div>
          <span>Troco esperado</span>
          <strong>{formatCurrency(expected)}</strong>
          <small>Saldo do caixa (reserva do último fechamento)</small>
        </div>

        <div>
          <span>Diferença</span>
          <strong className={!touched || difference === 0 ? "" : difference > 0 ? "is-income" : "is-expense"}>
            {touched ? formatCurrency(difference) : "—"}
          </strong>
          <small>{!touched ? "Informe o contado" : difference === 0 ? "Confere" : difference > 0 ? "Sobra" : "Falta"}</small>
        </div>
      </div>

      <div className="arc-field">
        <label htmlFor="open-cash-counted">Troco contado (R$)</label>
        <CurrencyInput
          id="open-cash-counted"
          value={counted}
          onChange={value => {
            setCounted(value);
            setTouched(true);
            setConfirming(false);
            setErrorMessage("");
          }}
          required
        />
        <small className="arc-hint">Conte o dinheiro que está no caixa agora e digite o total.</small>
      </div>

      <div className="arc-field">
        <label htmlFor="open-cash-notes">Observação (opcional)</label>
        <input
          id="open-cash-notes"
          type="text"
          value={notes}
          onChange={event => setNotes(event.target.value)}
          maxLength={200}
        />
      </div>

      {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

      {confirming ? (
        <DifferenceConfirm
          action="abrir"
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
            {submitting ? "Abrindo..." : "Abrir caixa"}
          </button>
        </div>
      )}
    </form>
  );
}

export default OpenCashForm;
