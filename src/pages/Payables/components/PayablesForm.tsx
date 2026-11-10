import {
  useEffect,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  createPayables,
  updatePayable
} from "../../../services/payablesService";

import {
  listSuppliers
} from "../../../services/suppliersService";

import type {
  Payable,
  PayableFormData
} from "../../../types/payable";

import type {
  Supplier
} from "../../../types/supplier";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";

type PayableFormProps = {
  payable: Payable | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function getToday() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

const emptyForm: PayableFormData = {
  supplierId: "",
  description: "",
  category: "",
  value: 0,
  interest: 0,
  penalty: 0,
  issueDate: getToday(),
  dueDate: getToday(),
  notes: "",
  installmentCount: 1
};

function PayableForm({
  payable,
  onCancel,
  onSaved
}: PayableFormProps) {
  const [formData, setFormData] =
    useState<PayableFormData>(emptyForm);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [loadingSuppliers, setLoadingSuppliers] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    async function loadSupplierOptions() {
      try {
        setLoadingSuppliers(true);

        const data =
          await listSuppliers();

        setSuppliers(data);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os fornecedores.";

        setErrorMessage(message);
      } finally {
        setLoadingSuppliers(false);
      }
    }

    loadSupplierOptions();
  }, []);

  useEffect(() => {
    if (payable) {
      setFormData({
        supplierId:
          payable.supplier_id,

        description:
          payable.description,

        category:
          payable.category ?? "",

        value:
          Number(
            payable.original_value || 0
          ),

        interest:
          Number(
            payable.interest || 0
          ),

        penalty:
          Number(
            payable.penalty || 0
          ),

        issueDate:
          payable.issue_date,

        dueDate:
          payable.due_date,

        notes:
          payable.notes ?? "",

        installmentCount: 1
      });
    } else {
      setFormData({
        ...emptyForm,
        issueDate: getToday(),
        dueDate: getToday()
      });
    }

    setErrorMessage("");
  }, [payable]);

  function updateField<
    K extends keyof PayableFormData
  >(
    field: K,
    value: PayableFormData[K]
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

    if (!formData.supplierId) {
      setErrorMessage(
        "Selecione o fornecedor."
      );
      return;
    }

    if (!formData.description.trim()) {
      setErrorMessage(
        "Informe a descrição da conta."
      );
      return;
    }

    if (
      Number(formData.value) <= 0
    ) {
      setErrorMessage(
        "Informe um valor maior que zero."
      );
      return;
    }

    if (!formData.issueDate) {
      setErrorMessage(
        "Informe a data de emissão."
      );
      return;
    }

    if (!formData.dueDate) {
      setErrorMessage(
        "Informe a data de vencimento."
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const normalizedData: PayableFormData = {
        supplierId:
          formData.supplierId,

        description:
          formData.description.trim(),

        category:
          formData.category.trim(),

        value:
          Number(formData.value || 0),

        interest:
          Number(formData.interest || 0),

        penalty:
          Number(formData.penalty || 0),

        issueDate:
          formData.issueDate,

        dueDate:
          formData.dueDate,

        notes:
          formData.notes.trim(),

        installmentCount:
          Math.max(
            Number(
              formData.installmentCount || 1
            ),
            1
          )
      };

      if (payable) {
        await updatePayable(
          payable.id,
          normalizedData
        );
      } else {
        await createPayables(
          normalizedData
        );
      }

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a conta.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="payable-form"
      onSubmit={handleSubmit}
    >
      <div className="payable-form-grid">
        <div className="payable-field payable-field-full">
          <label htmlFor="payable-supplier">
            Fornecedor
          </label>

          <select
            id="payable-supplier"
            value={formData.supplierId}
            onChange={event =>
              updateField(
                "supplierId",
                event.target.value
              )
            }
            disabled={loadingSuppliers}
            required
          >
            <option value="">
              {loadingSuppliers
                ? "Carregando fornecedores..."
                : "Selecione o fornecedor"}
            </option>

            {suppliers.map(supplier => (
              <option
                key={supplier.id}
                value={supplier.id}
              >
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div className="payable-field payable-field-full">
          <label htmlFor="payable-description">
            Descrição
          </label>

          <input
            id="payable-description"
            type="text"
            value={formData.description}
            onChange={event =>
              updateField(
                "description",
                event.target.value
              )
            }
            autoFocus
            required
          />
        </div>

        <div className="payable-field payable-field-full">
          <label htmlFor="payable-category">
            Categoria
          </label>

          <input
            id="payable-category"
            type="text"
            value={formData.category}
            onChange={event =>
              updateField(
                "category",
                event.target.value
              )
            }
            placeholder="Ex.: Moradia, internet, veículo..."
          />
        </div>

        <div className="payable-field">
          <label htmlFor="payable-value">
            Valor (R$)
          </label>

          <CurrencyInput
            id="payable-value"
            value={formData.value}
            onChange={value =>
              updateField(
                "value",
                value
              )
            }
            required
          />
        </div>

        <div className="payable-field">
          <label htmlFor="payable-installments">
            Quantidade de parcelas
          </label>

          <input
            id="payable-installments"
            type="number"
            min="1"
            step="1"
            value={
              formData.installmentCount
            }
            onChange={event =>
              updateField(
                "installmentCount",
                Math.max(
                  Number(
                    event.target.value || 1
                  ),
                  1
                )
              )
            }
            disabled={Boolean(payable)}
          />
        </div>

        <div className="payable-field">
          <label htmlFor="payable-interest">
            Juros (R$)
          </label>

          <CurrencyInput
            id="payable-interest"
            value={formData.interest}
            onChange={value =>
              updateField(
                "interest",
                value
              )
            }
          />
        </div>

        <div className="payable-field">
          <label htmlFor="payable-penalty">
            Multa (R$)
          </label>

          <CurrencyInput
            id="payable-penalty"
            value={formData.penalty}
            onChange={value =>
              updateField(
                "penalty",
                value
              )
            }
          />
        </div>

        <div className="payable-field">
          <label htmlFor="payable-issue-date">
            Data de emissão
          </label>

          <input
            id="payable-issue-date"
            type="date"
            value={formData.issueDate}
            onChange={event =>
              updateField(
                "issueDate",
                event.target.value
              )
            }
            required
          />
        </div>

        <div className="payable-field">
          <label htmlFor="payable-due-date">
            Primeiro vencimento
          </label>

          <input
            id="payable-due-date"
            type="date"
            value={formData.dueDate}
            onChange={event =>
              updateField(
                "dueDate",
                event.target.value
              )
            }
            required
          />
        </div>

        <div className="payable-field payable-field-full">
          <label htmlFor="payable-notes">
            Observações
          </label>

          <textarea
            id="payable-notes"
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
        <div className="payable-form-error">
          {errorMessage}
        </div>
      )}

      <div className="payable-form-actions">
        <button
          type="button"
          className="payable-button payable-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="payable-button payable-button-primary"
          disabled={submitting}
        >
          {submitting
            ? "Salvando..."
            : payable
              ? "Salvar alterações"
              : "Cadastrar conta"}
        </button>
      </div>
    </form>
  );
}

export default PayableForm;