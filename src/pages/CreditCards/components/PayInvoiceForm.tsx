import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { listAccountsWithBalance } from "../../../services/bankAccountsService";
import { payCardInvoice } from "../../../services/cardInvoicesService";
import { formatAccountLabel } from "../../../utils/bank";
import { formatCurrency } from "../../../utils/currency";
import { formatDay, invoiceLabel } from "../../../utils/cardInvoices";
import type { CardInvoice } from "../../../utils/cardInvoices";

import type { AccountWithBalance } from "../../../types/bankAccount";
import type { CreditCard } from "../../../types/creditCard";

type PayInvoiceFormProps = {
  card: CreditCard;
  invoice: CardInvoice;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

/** Baixa da fatura: paga o que está em aberto, pela conta bancária ou pelo caixa. */
function PayInvoiceForm({ card, invoice, onCancel, onSaved }: PayInvoiceFormProps) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [accountId, setAccountId] = useState(card.bank_account_id ?? "");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    listAccountsWithBalance()
      .then(data => {
        if (active) {
          setAccounts(data);
          setAccountId(current => current || data[0]?.id || "");
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage("Não foi possível carregar as contas.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const account = accounts.find(item => item.id === accountId);
  const balanceAfter = account ? account.balance - invoice.open : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accountId) {
      setErrorMessage("Escolha de onde sai o dinheiro.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      await payCardInvoice({
        cardId: card.id,
        invoiceMonth: invoice.month,
        accountId,
        date,
        notes
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível pagar a fatura.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="arc-form" onSubmit={handleSubmit}>
      <div className="card-pay-summary">
        <span>Fatura de {invoiceLabel(invoice.month)} · vence {formatDay(invoice.dueDate)}</span>
        <strong>{formatCurrency(invoice.open)}</strong>
        {invoice.paid > 0 && <small>Já pago antes: {formatCurrency(invoice.paid)}</small>}
      </div>

      <div className="arc-form-grid">
        <div className="arc-field">
          <label htmlFor="pay-account">Pagar com</label>
          <select
            id="pay-account"
            value={accountId}
            onChange={event => {
              setAccountId(event.target.value);
              setErrorMessage("");
            }}
            required
          >
            <option value="">Escolha a conta ou o caixa</option>
            {accounts.map(item => (
              <option key={item.id} value={item.id}>
                {item.account_type === "caixa" ? `Caixa: ${item.name}` : formatAccountLabel(item)}
                {` · saldo ${formatCurrency(item.balance)}`}
              </option>
            ))}
          </select>
        </div>

        <div className="arc-field">
          <label htmlFor="pay-date">Data do pagamento</label>
          <input id="pay-date" type="date" value={date} onChange={event => setDate(event.target.value)} required />
        </div>
      </div>

      <div className="arc-field">
        <label htmlFor="pay-notes">Observação (opcional)</label>
        <input id="pay-notes" type="text" value={notes} onChange={event => setNotes(event.target.value)} maxLength={200} />
      </div>

      {balanceAfter !== null && (
        <small className={balanceAfter < 0 ? "account-balance-hint account-balance-hint-danger" : "account-balance-hint"}>
          Saldo de {account?.account_type === "caixa" ? "caixa" : "conta"}: {formatCurrency(account?.balance ?? 0)} → depois: {formatCurrency(balanceAfter)}
        </small>
      )}

      {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

      <div className="arc-form-actions">
        <button type="button" className="arc-button arc-button-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="arc-button arc-button-primary" disabled={submitting}>
          {submitting ? "Pagando..." : `Pagar ${formatCurrency(invoice.open)}`}
        </button>
      </div>
    </form>
  );
}

export default PayInvoiceForm;
