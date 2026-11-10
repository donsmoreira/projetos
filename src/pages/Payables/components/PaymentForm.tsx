import {
  useEffect,
  useMemo,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  listBankAccounts
} from "../../../services/bankAccountsService";

import {
  payPayable
} from "../../../services/payablesService";

import type {
  BankAccount
} from "../../../types/bankAccount";

import { formatAccountLabel } from "../../../utils/bank";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";

import type {
  Payable,
  PayableBankAccount,
  PayablePaymentData
} from "../../../types/payable";

type PaymentFormProps = {
  payable: Payable;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function getToday() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

function getPayableTotal(
  payable: Payable
) {
  return (
    Number(payable.original_value || 0) +
    Number(payable.interest || 0) +
    Number(payable.penalty || 0)
  );
}

function PaymentForm({
  payable,
  onCancel,
  onSaved
}: PaymentFormProps) {
  const payableTotal = useMemo(
    () => getPayableTotal(payable),
    [payable]
  );

  const [bankAccounts, setBankAccounts] =
    useState<BankAccount[]>([]);

  const [formData, setFormData] =
    useState<PayablePaymentData>({
      bankAccountId: "",
      paymentDate: getToday(),
      paidValue: payableTotal,
      paymentNotes: ""
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
          await listBankAccounts();

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
      paymentDate: getToday(),
      paidValue: payableTotal,
      paymentNotes: ""
    });

    setErrorMessage("");
  }, [payable, payableTotal]);

  function updateField<
    K extends keyof PayablePaymentData
  >(
    field: K,
    value: PayablePaymentData[K]
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
        "Selecione a conta bancária."
      );
      return;
    }

    if (!formData.paymentDate) {
      setErrorMessage(
        "Informe a data do pagamento."
      );
      return;
    }

    if (
      Number(formData.paidValue) <= 0
    ) {
      setErrorMessage(
        "Informe um valor pago maior que zero."
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
        "A conta bancária selecionada não foi encontrada."
      );
      return;
    }

    const bankAccount: PayableBankAccount = {
      id: selectedAccount.id,
      name: selectedAccount.name,
      bank: selectedAccount.bank
    };

    try {
      setSubmitting(true);
      setErrorMessage("");

      await payPayable(
        payable,
        bankAccount,
        {
          bankAccountId:
            formData.bankAccountId,

          paymentDate:
            formData.paymentDate,

          paidValue:
            Number(
              formData.paidValue || 0
            ),

          paymentNotes:
            formData.paymentNotes.trim()
        }
      );

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o pagamento.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="payment-form"
      onSubmit={handleSubmit}
    >
      <div className="payment-summary">
        <span>Conta</span>

        <strong>
          {payable.description}
        </strong>

        <small>
          {payable.suppliers?.name ||
            "Fornecedor não informado"}
        </small>
      </div>

      <div className="payment-form-grid">
        <div className="payment-field payment-field-full">
          <label htmlFor="payment-bank-account">
            Conta bancária
          </label>

          <select
            id="payment-bank-account"
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
                : "Selecione a conta bancária"}
            </option>

            {bankAccounts.map(account => (
              <option
                key={account.id}
                value={account.id}
              >
                {formatAccountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="payment-field">
          <label htmlFor="payment-date">
            Data do pagamento
          </label>

          <input
            id="payment-date"
            type="date"
            value={formData.paymentDate}
            onChange={event =>
              updateField(
                "paymentDate",
                event.target.value
              )
            }
            required
          />
        </div>

        <div className="payment-field">
          <label htmlFor="payment-value">
            Valor pago (R$)
          </label>

          <CurrencyInput
            id="payment-value"
            value={formData.paidValue}
            onChange={value =>
              updateField(
                "paidValue",
                value
              )
            }
            required
          />
        </div>

        <div className="payment-field payment-field-full">
          <label htmlFor="payment-notes">
            Observações do pagamento
          </label>

          <textarea
            id="payment-notes"
            value={formData.paymentNotes}
            onChange={event =>
              updateField(
                "paymentNotes",
                event.target.value
              )
            }
            rows={4}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="payment-form-error">
          {errorMessage}
        </div>
      )}

      <div className="payment-form-actions">
        <button
          type="button"
          className="payment-button payment-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="payment-button payment-button-primary"
          disabled={
            submitting ||
            loadingAccounts
          }
        >
          {submitting
            ? "Registrando..."
            : "Confirmar pagamento"}
        </button>
      </div>
    </form>
  );
}

export default PaymentForm;