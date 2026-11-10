import {
  useEffect,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  createCreditCard,
  updateCreditCard
} from "../../../services/creditCardsService";

import {
  listBankAccounts
} from "../../../services/bankAccountsService";

import { CARD_BRANDS } from "../../../constants/cardBrands";

import {
  cleanBankName,
  formatAccountLabel
} from "../../../utils/bank";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";

import type {
  CreditCard,
  CreditCardFormData
} from "../../../types/creditCard";

import type {
  BankAccount
} from "../../../types/bankAccount";

type CreditCardFormProps = {
  card: CreditCard | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL"
    }
  );
}

const emptyForm: CreditCardFormData = {
  name: "",
  bankAccountId: "",
  brand: "",
  finalDigits: "",
  holderName: "",
  limitTotal: 0,
  closingDay: 1,
  dueDay: 1,
  color: "#1a7cff",
  notes: ""
};

function CreditCardForm({
  card,
  onCancel,
  onSaved
}: CreditCardFormProps) {
  const [formData, setFormData] =
    useState<CreditCardFormData>(
      emptyForm
    );

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [bankAccounts, setBankAccounts] =
    useState<BankAccount[]>([]);

  const [loadingAccounts, setLoadingAccounts] =
    useState(true);

  useEffect(() => {
    async function loadAccounts() {
      try {
        setLoadingAccounts(true);

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
    if (card) {
      setFormData({
        name: card.name,
        bankAccountId:
          card.bank_account_id ?? "",
        brand: card.brand ?? "",
        finalDigits:
          card.final_digits ?? "",
        holderName:
          card.holder_name ?? "",
        limitTotal:
          Number(card.limit_total || 0),
        closingDay:
          Number(card.closing_day || 1),
        dueDay:
          Number(card.due_day || 1),
        color:
          card.color || "#1a7cff",
        notes:
          card.notes ?? ""
      });
    } else {
      setFormData(emptyForm);
    }

    setErrorMessage("");
  }, [card]);

  function updateField<
    K extends keyof CreditCardFormData
  >(
    field: K,
    value: CreditCardFormData[K]
  ) {
    setFormData(current => ({
      ...current,
      [field]: value
    }));
  }

  // Nome do cartão = banco da conta selecionada + bandeira, ex.: "SICREDI VISA"
  const selectedAccount = bankAccounts.find(
    account =>
      account.id === formData.bankAccountId
  );

  const cardName = [
    cleanBankName(selectedAccount?.bank) ||
      cleanBankName(selectedAccount?.name),
    formData.brand
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!formData.bankAccountId) {
      setErrorMessage(
        "Selecione o banco do cartão."
      );
      return;
    }

    if (!formData.brand) {
      setErrorMessage(
        "Selecione a bandeira do cartão."
      );
      return;
    }

    if (
      Number(formData.limitTotal) < 0
    ) {
      setErrorMessage(
        "O limite total não pode ser negativo."
      );
      return;
    }

    if (
      formData.finalDigits &&
      !/^\d{4}$/.test(
        formData.finalDigits
      )
    ) {
      setErrorMessage(
        "Informe exatamente os 4 últimos dígitos do cartão."
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const normalizedData: CreditCardFormData = {
        name:
          cardName,

        bankAccountId:
          formData.bankAccountId,

        brand:
          formData.brand,

        finalDigits:
          formData.finalDigits.trim(),

        holderName:
          formData.holderName.trim(),

        limitTotal:
          Number(
            formData.limitTotal || 0
          ),

        closingDay:
          Number(
            formData.closingDay || 1
          ),

        dueDay:
          Number(
            formData.dueDay || 1
          ),

        color:
          formData.color,

        notes:
          formData.notes.trim()
      };

      if (card) {
        await updateCreditCard(
          card.id,
          normalizedData
        );
      } else {
        await createCreditCard(
          normalizedData
        );
      }

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o cartão.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="credit-card-form"
      onSubmit={handleSubmit}
    >
      <div className="credit-card-form-grid">
        <div className="credit-card-field credit-card-field-full">
          <span className="credit-card-field-label">
            Nome do cartão
          </span>

          <div
            className="credit-card-readonly-value"
            aria-live="polite"
          >
            <strong>
              {cardName || "—"}
            </strong>

            <small>
              Preenchido sozinho: banco + bandeira
            </small>
          </div>
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-bank">
            Banco
          </label>

          <select
            id="credit-card-bank"
            value={formData.bankAccountId}
            onChange={event =>
              updateField(
                "bankAccountId",
                event.target.value
              )
            }
            disabled={loadingAccounts}
            autoFocus
            required
          >
            <option value="">
              {loadingAccounts
                ? "Carregando contas..."
                : bankAccounts.length === 0
                  ? "Cadastre uma conta em Contas Bancárias"
                  : "Selecione o banco"}
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

        <div className="credit-card-field">
          <label htmlFor="credit-card-brand">
            Bandeira
          </label>

          <select
            id="credit-card-brand"
            value={formData.brand}
            onChange={event =>
              updateField(
                "brand",
                event.target.value
              )
            }
            required
          >
            <option value="">
              Selecione a bandeira
            </option>

            {/* Mantém uma bandeira antiga que não esteja na lista */}
            {formData.brand &&
              !(CARD_BRANDS as readonly string[]).includes(
                formData.brand
              ) && (
                <option value={formData.brand}>
                  {formData.brand}
                </option>
              )}

            {CARD_BRANDS.map(brand => (
              <option
                key={brand}
                value={brand}
              >
                {brand}
              </option>
            ))}
          </select>
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-final">
            Últimos 4 dígitos
          </label>

          <input
            id="credit-card-final"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={formData.finalDigits}
            onChange={event =>
              updateField(
                "finalDigits",
                event.target.value
                  .replace(/\D/g, "")
                  .slice(0, 4)
              )
            }
          />
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-holder">
            Nome do titular
          </label>

          <input
            id="credit-card-holder"
            type="text"
            value={formData.holderName}
            onChange={event =>
              updateField(
                "holderName",
                event.target.value
              )
            }
          />
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-limit">
            Limite total (R$)
          </label>

          <CurrencyInput
            id="credit-card-limit"
            value={formData.limitTotal}
            onChange={value =>
              updateField(
                "limitTotal",
                value
              )
            }
          />
        </div>

        <div className="credit-card-field">
          <span className="credit-card-field-label">
            Limite disponível
          </span>

          <div
            className="credit-card-readonly-value"
            aria-live="polite"
          >
            <strong>
              {formatCurrency(
                Math.max(
                  Number(formData.limitTotal || 0) -
                    (card?.used_limit ?? 0),
                  0
                )
              )}
            </strong>

            <small>
              Limite total − (gastos − baixas)
              {card
                ? ` · utilizado: ${formatCurrency(card.used_limit)}`
                : ""}
            </small>
          </div>
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-closing">
            Dia do fechamento
          </label>

          <input
            id="credit-card-closing"
            type="number"
            min="1"
            max="31"
            step="1"
            value={formData.closingDay}
            onChange={event =>
              updateField(
                "closingDay",
                Number(
                  event.target.value || 1
                )
              )
            }
          />
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-due">
            Dia do vencimento
          </label>

          <input
            id="credit-card-due"
            type="number"
            min="1"
            max="31"
            step="1"
            value={formData.dueDay}
            onChange={event =>
              updateField(
                "dueDay",
                Number(
                  event.target.value || 1
                )
              )
            }
          />
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-color">
            Cor do cartão
          </label>

          <input
            id="credit-card-color"
            type="color"
            value={formData.color}
            onChange={event =>
              updateField(
                "color",
                event.target.value
              )
            }
          />
        </div>

        <div className="credit-card-field credit-card-field-full">
          <label htmlFor="credit-card-notes">
            Observações
          </label>

          <textarea
            id="credit-card-notes"
            value={formData.notes}
            onChange={event =>
              updateField(
                "notes",
                event.target.value
              )
            }
            rows={4}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="credit-card-form-error">
          {errorMessage}
        </div>
      )}

      <div className="credit-card-form-actions">
        <button
          type="button"
          className="credit-card-button credit-card-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="credit-card-button credit-card-button-primary"
          disabled={submitting}
        >
          {submitting
            ? "Salvando..."
            : card
              ? "Salvar alterações"
              : "Cadastrar cartão"}
        </button>
      </div>
    </form>
  );
}

export default CreditCardForm;