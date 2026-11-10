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

import type {
  CreditCard,
  CreditCardFormData
} from "../../../types/creditCard";

type CreditCardFormProps = {
  card: CreditCard | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const emptyForm: CreditCardFormData = {
  name: "",
  bank: "",
  brand: "",
  finalDigits: "",
  holderName: "",
  limitTotal: 0,
  closingDay: 1,
  dueDay: 1,
  color: "#183c34",
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

  useEffect(() => {
    if (card) {
      setFormData({
        name: card.name,
        bank: card.bank ?? "",
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
          card.color || "#183c34",
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

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!formData.name.trim()) {
      setErrorMessage(
        "Informe o nome do cartão."
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
          formData.name.trim(),

        bank:
          formData.bank.trim(),

        brand:
          formData.brand.trim(),

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
          <label htmlFor="credit-card-name">
            Nome do cartão
          </label>

          <input
            id="credit-card-name"
            type="text"
            value={formData.name}
            onChange={event =>
              updateField(
                "name",
                event.target.value
              )
            }
            placeholder="Ex.: Nubank Platinum"
            autoFocus
            required
          />
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-bank">
            Banco
          </label>

          <input
            id="credit-card-bank"
            type="text"
            value={formData.bank}
            onChange={event =>
              updateField(
                "bank",
                event.target.value
              )
            }
          />
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-brand">
            Bandeira
          </label>

          <input
            id="credit-card-brand"
            type="text"
            value={formData.brand}
            onChange={event =>
              updateField(
                "brand",
                event.target.value
              )
            }
            placeholder="Ex.: Mastercard"
          />
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
            Limite total
          </label>

          <input
            id="credit-card-limit"
            type="number"
            min="0"
            step="0.01"
            value={formData.limitTotal}
            onChange={event =>
              updateField(
                "limitTotal",
                Number(
                  event.target.value || 0
                )
              )
            }
          />
        </div>

        <div className="credit-card-field">
          <label htmlFor="credit-card-available">
            Limite disponível
          </label>

          <input
            id="credit-card-available"
            type="text"
            value={
              card
                ? card.available_limit.toLocaleString(
                    "pt-BR",
                    {
                      style: "currency",
                      currency: "BRL"
                    }
                  )
                : "Igual ao limite total"
            }
            readOnly
            disabled
            title="Calculado pelas compras ainda não pagas na fatura"
          />
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