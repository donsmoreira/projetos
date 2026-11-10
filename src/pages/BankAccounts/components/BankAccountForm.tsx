import {
  useEffect,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  createBankAccount,
  updateBankAccount
} from "../../../services/bankAccountsService";

import type {
  BankAccount,
  BankAccountFormData
} from "../../../types/bankAccount";

type BankAccountFormProps = {
  account: BankAccount | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const emptyForm: BankAccountFormData = {
  name: "",
  bank: "",
  agency: "",
  accountNumber: "",
  initialBalance: 0,
  overdraftLimit: 0
};

function BankAccountForm({
  account,
  onCancel,
  onSaved
}: BankAccountFormProps) {
  const [formData, setFormData] =
    useState<BankAccountFormData>(emptyForm);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        bank: account.bank ?? "",
        agency: account.agency ?? "",
        accountNumber:
          account.account_number ?? "",
        initialBalance:
          Number(account.initial_balance || 0),
        overdraftLimit:
          Number(account.overdraft_limit || 0)
      });
    } else {
      setFormData(emptyForm);
    }

    setErrorMessage("");
  }, [account]);

  function updateField<
    K extends keyof BankAccountFormData
  >(
    field: K,
    value: BankAccountFormData[K]
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

    if (!formData.name.trim()) {
      setErrorMessage(
        "Informe o nome da conta."
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const normalizedData: BankAccountFormData = {
        name: formData.name.trim(),
        bank: formData.bank.trim(),
        agency: formData.agency.trim(),
        accountNumber:
          formData.accountNumber.trim(),
        initialBalance:
          Number(formData.initialBalance || 0),
        overdraftLimit:
          Number(formData.overdraftLimit || 0)
      };

      if (account) {
        await updateBankAccount(
          account.id,
          normalizedData
        );
      } else {
        await createBankAccount(
          normalizedData
        );
      }

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a conta bancária.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="bank-account-form"
      onSubmit={handleSubmit}
    >
      <div className="bank-account-form-grid">
        <div className="bank-account-field bank-account-field-full">
          <label htmlFor="bank-account-name">
            Nome da conta
          </label>

          <input
            id="bank-account-name"
            type="text"
            value={formData.name}
            onChange={event =>
              updateField(
                "name",
                event.target.value
              )
            }
            placeholder="Ex.: Conta principal"
            autoFocus
            required
          />
        </div>

        <div className="bank-account-field bank-account-field-full">
          <label htmlFor="bank-account-bank">
            Banco
          </label>

          <input
            id="bank-account-bank"
            type="text"
            value={formData.bank}
            onChange={event =>
              updateField(
                "bank",
                event.target.value
              )
            }
            placeholder="Ex.: Sicoob"
          />
        </div>

        <div className="bank-account-field">
          <label htmlFor="bank-account-agency">
            Agência
          </label>

          <input
            id="bank-account-agency"
            type="text"
            value={formData.agency}
            onChange={event =>
              updateField(
                "agency",
                event.target.value
              )
            }
          />
        </div>

        <div className="bank-account-field">
          <label htmlFor="bank-account-number">
            Número da conta
          </label>

          <input
            id="bank-account-number"
            type="text"
            value={formData.accountNumber}
            onChange={event =>
              updateField(
                "accountNumber",
                event.target.value
              )
            }
          />
        </div>

        <div className="bank-account-field">
          <label htmlFor="bank-account-balance">
            Saldo inicial
          </label>

          <input
            id="bank-account-balance"
            type="number"
            step="0.01"
            value={formData.initialBalance}
            onChange={event =>
              updateField(
                "initialBalance",
                Number(event.target.value || 0)
              )
            }
          />
        </div>

        <div className="bank-account-field">
          <label htmlFor="bank-account-limit">
            Limite de cheque especial
          </label>

          <input
            id="bank-account-limit"
            type="number"
            min="0"
            step="0.01"
            value={formData.overdraftLimit}
            onChange={event =>
              updateField(
                "overdraftLimit",
                Number(event.target.value || 0)
              )
            }
          />
        </div>
      </div>

      {errorMessage && (
        <div className="bank-account-form-error">
          {errorMessage}
        </div>
      )}

      <div className="bank-account-form-actions">
        <button
          type="button"
          className="bank-account-button bank-account-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="bank-account-button bank-account-button-primary"
          disabled={submitting}
        >
          {submitting
            ? "Salvando..."
            : account
              ? "Salvar alterações"
              : "Cadastrar conta"}
        </button>
      </div>
    </form>
  );
}

export default BankAccountForm;