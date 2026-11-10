import {
  useEffect,
  useMemo,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  listAccountsWithBalance
} from "../../../services/bankAccountsService";

import {
  receiveReceivable
} from "../../../services/receivablesService";

import type {
  AccountWithBalance
} from "../../../types/bankAccount";

import AccountOptions, {
  AccountBalanceHint
} from "../../../components/AccountOptions/AccountOptions";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";

import type {
  Receivable,
  ReceivableBankAccount,
  ReceivableReceiptData
} from "../../../types/receivable";

type ReceiptFormProps = {
  receivable: Receivable;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function getToday() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

function getReceivableTotal(
  receivable: Receivable
) {
  return (
    Number(receivable.original_value || 0) +
    Number(receivable.interest || 0) +
    Number(receivable.penalty || 0)
  );
}

function ReceiptForm({
  receivable,
  onCancel,
  onSaved
}: ReceiptFormProps) {
  const receivableTotal = useMemo(
    () => getReceivableTotal(receivable),
    [receivable]
  );

  const [bankAccounts, setBankAccounts] =
    useState<AccountWithBalance[]>([]);

  const [formData, setFormData] =
    useState<ReceivableReceiptData>({
      bankAccountId: "",
      receiptDate: getToday(),
      receivedValue: receivableTotal,
      receiptNotes: ""
    });

  const [loadingAccounts, setLoadingAccounts] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    async function loadAccounts() {
      try {
        setLoadingAccounts(true);
        setErrorMessage("");

        const data =
          await listAccountsWithBalance();

        setBankAccounts(data);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as contas bancárias.";

        setErrorMessage(message);
      } finally {
        setLoadingAccounts(false);
      }
    }

    loadAccounts();
  }, []);

  useEffect(() => {
    setFormData({
      bankAccountId: "",
      receiptDate: getToday(),
      receivedValue: receivableTotal,
      receiptNotes: ""
    });

    setErrorMessage("");
  }, [receivable, receivableTotal]);

  function updateField<
    K extends keyof ReceivableReceiptData
  >(
    field: K,
    value: ReceivableReceiptData[K]
  ) {
    setFormData(current => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!formData.bankAccountId) {
      setErrorMessage(
        "Selecione a conta bancária ou o caixa."
      );
      return;
    }

    if (!formData.receiptDate) {
      setErrorMessage(
        "Informe a data do recebimento."
      );
      return;
    }

    if (
      Number(formData.receivedValue) <= 0
    ) {
      setErrorMessage(
        "Informe um valor recebido maior que zero."
      );
      return;
    }

    const selectedAccount =
      bankAccounts.find(
        account =>
          account.id ===
          formData.bankAccountId
      );

    if (!selectedAccount) {
      setErrorMessage(
        "A conta selecionada não foi encontrada."
      );
      return;
    }

    const bankAccount: ReceivableBankAccount = {
      id: selectedAccount.id,
      name: selectedAccount.name,
      bank: selectedAccount.bank,
      account_type: selectedAccount.account_type
    };

    try {
      setSubmitting(true);
      setErrorMessage("");

      await receiveReceivable(
        receivable,
        bankAccount,
        {
          bankAccountId:
            formData.bankAccountId,

          receiptDate:
            formData.receiptDate,

          receivedValue:
            Number(
              formData.receivedValue || 0
            ),

          receiptNotes:
            formData.receiptNotes.trim()
        }
      );

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o recebimento.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="receipt-form"
      onSubmit={handleSubmit}
    >
      <div className="receipt-summary">
        <span>Conta</span>

        <strong>
          {receivable.description}
        </strong>

        <small>
          {receivable.clients?.name ||
            "Cliente não informado"}
        </small>
      </div>

      <div className="receipt-form-grid">
        <div className="receipt-field receipt-field-full">
          <label htmlFor="receipt-bank-account">
            Receber em (conta bancária ou caixa)
          </label>

          <select
            id="receipt-bank-account"
            value={formData.bankAccountId}
            onChange={event =>
              updateField(
                "bankAccountId",
                event.target.value
              )
            }
            disabled={loadingAccounts}
            required
          >
            <option value="">
              {loadingAccounts
                ? "Carregando contas..."
                : "Selecione a conta ou o caixa"}
            </option>

            <AccountOptions accounts={bankAccounts} />
          </select>

          <AccountBalanceHint
            account={bankAccounts.find(
              account => account.id === formData.bankAccountId
            )}
            value={Number(formData.receivedValue || 0)}
            direction="entrada"
          />
        </div>

        <div className="receipt-field">
          <label htmlFor="receipt-date">
            Data do recebimento
          </label>

          <input
            id="receipt-date"
            type="date"
            value={formData.receiptDate}
            onChange={event =>
              updateField(
                "receiptDate",
                event.target.value
              )
            }
            required
          />
        </div>

        <div className="receipt-field">
          <label htmlFor="receipt-value">
            Valor recebido (R$)
          </label>

          <CurrencyInput
            id="receipt-value"
            value={formData.receivedValue}
            onChange={value =>
              updateField(
                "receivedValue",
                value
              )
            }
            required
          />
        </div>

        <div className="receipt-field receipt-field-full">
          <label htmlFor="receipt-notes">
            Observações do recebimento
          </label>

          <textarea
            id="receipt-notes"
            value={formData.receiptNotes}
            onChange={event =>
              updateField(
                "receiptNotes",
                event.target.value
              )
            }
            rows={4}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="receipt-form-error">
          {errorMessage}
        </div>
      )}

      <div className="receipt-form-actions">
        <button
          type="button"
          className="receipt-button receipt-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="receipt-button receipt-button-primary"
          disabled={
            submitting ||
            loadingAccounts
          }
        >
          {submitting
            ? "Registrando..."
            : "Confirmar recebimento"}
        </button>
      </div>
    </form>
  );
}

export default ReceiptForm;