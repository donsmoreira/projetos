import { useState } from "react";
import type { FormEvent } from "react";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import ManagementAccountSelect from "../../../components/ManagementAccountSelect/ManagementAccountSelect";
import { createCardPurchase } from "../../../services/cardInvoicesService";
import { formatCurrency } from "../../../utils/currency";
import {
  addMonths,
  dueDate,
  firstInvoice,
  formatDay,
  invoiceLabel
} from "../../../utils/cardInvoices";

import type { CreditCard } from "../../../types/creditCard";
import { appConfirm } from "../../../components/Dialog/dialog";

type CardPurchaseFormProps = {
  card: CreditCard;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

const MAX_INSTALLMENTS = 24;

/** Lançar compra no cartão, à vista ou parcelada. */
function CardPurchaseForm({ card, onCancel, onSaved }: CardPurchaseFormProps) {
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const closingDay = card.closing_day ?? 0;
  const dueDay = card.due_day ?? 0;
  const hasDays = closingDay > 0 && dueDay > 0;

  // Mesma divisão do banco: parcelas iguais, centavos que sobram na 1ª
  const part = Math.floor((total / installments) * 100) / 100;
  const first = Math.round((total - part * (installments - 1)) * 100) / 100;

  const firstMonth = hasDays && date ? firstInvoice(closingDay, dueDay, date) : null;
  const lastMonth = firstMonth ? addMonths(firstMonth, installments - 1) : null;
  const overLimit = total > card.available_limit;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasDays) {
      setErrorMessage("Informe o dia de fechamento e o de vencimento no cadastro do cartão.");
      return;
    }

    if (!description.trim()) {
      setErrorMessage("Descreva a compra (ex.: Livro, Mercado, Passagem).");
      return;
    }

    if (total <= 0) {
      setErrorMessage("Informe o valor total da compra.");
      return;
    }

    if (overLimit && !await appConfirm(
      `A compra (${formatCurrency(total)}) passa do limite disponível do cartão (${formatCurrency(card.available_limit)}). Lançar mesmo assim?`
    )) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      await createCardPurchase({
        cardId: card.id,
        date,
        description,
        total,
        installments,
        managementAccountId: accountId || null
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível lançar a compra.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="arc-form" onSubmit={handleSubmit}>
      <div className="arc-field">
        <label htmlFor="purchase-description">Descrição</label>
        <input
          id="purchase-description"
          type="text"
          value={description}
          onChange={event => {
            setDescription(event.target.value);
            setErrorMessage("");
          }}
          placeholder="Ex.: Livro, Mercado, Passagem"
          maxLength={120}
          autoFocus
        />
      </div>

      <div className="arc-form-grid">
        <div className="arc-field">
          <label htmlFor="purchase-date">Data da compra</label>
          <input
            id="purchase-date"
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            required
          />
        </div>

        <div className="arc-field">
          <label htmlFor="purchase-total">Valor total (R$)</label>
          <CurrencyInput
            id="purchase-total"
            value={total}
            onChange={value => {
              setTotal(value);
              setErrorMessage("");
            }}
            required
          />
        </div>

        <div className="arc-field">
          <label htmlFor="purchase-installments">Parcelas</label>
          <select
            id="purchase-installments"
            value={installments}
            onChange={event => setInstallments(Number(event.target.value))}
          >
            {Array.from({ length: MAX_INSTALLMENTS }, (_, index) => index + 1).map(count => {
              const each = total > 0 ? Math.floor((total / count) * 100) / 100 : 0;
              return (
                <option key={count} value={count}>
                  {count === 1 ? "À vista (1x)" : `${count}x`}
                  {total > 0 ? ` de ${formatCurrency(each)}` : ""}
                </option>
              );
            })}
          </select>
        </div>

        <div className="arc-field">
          <label htmlFor="purchase-account">Conta gerencial (opcional)</label>
          <ManagementAccountSelect
            id="purchase-account"
            type="despesa"
            value={accountId}
            onChange={id => setAccountId(id)}
          />
        </div>
      </div>

      {firstMonth && lastMonth && total > 0 && (
        <div className="card-purchase-preview">
          <strong>
            {installments === 1
              ? `À vista: ${formatCurrency(total)}`
              : `${installments}x de ${formatCurrency(part)}`}
            {installments > 1 && first !== part ? ` (1ª de ${formatCurrency(first)})` : ""}
          </strong>
          <span>
            {installments === 1 ? "Entra na fatura de " : "Da fatura de "}
            <b>{invoiceLabel(firstMonth)}</b> (vence {formatDay(dueDate(dueDay, firstMonth))})
            {installments > 1 && <> até a de <b>{invoiceLabel(lastMonth)}</b></>}.
          </span>
          {overLimit && (
            <span className="card-purchase-warning">
              Passa do limite disponível ({formatCurrency(card.available_limit)}).
            </span>
          )}
        </div>
      )}

      {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

      <div className="arc-form-actions">
        <button type="button" className="arc-button arc-button-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="arc-button arc-button-primary" disabled={submitting}>
          {submitting ? "Lançando..." : "Lançar compra"}
        </button>
      </div>
    </form>
  );
}

export default CardPurchaseForm;
