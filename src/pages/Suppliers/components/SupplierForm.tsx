import {
  useEffect,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  createSupplier,
  updateSupplier
} from "../../../services/suppliersService";

import type {
  Supplier,
  SupplierFormData
} from "../../../types/supplier";

type SupplierFormProps = {
  supplier: Supplier | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const emptyForm: SupplierFormData = {
  name: "",
  document: "",
  phone: "",
  email: "",
  notes: ""
};

function SupplierForm({
  supplier,
  onCancel,
  onSaved
}: SupplierFormProps) {
  const [formData, setFormData] =
    useState<SupplierFormData>(emptyForm);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    if (supplier) {
      setFormData({
        name: supplier.name,
        document: supplier.document ?? "",
        phone: supplier.phone ?? "",
        email: supplier.email ?? "",
        notes: supplier.notes ?? ""
      });
    } else {
      setFormData(emptyForm);
    }

    setErrorMessage("");
  }, [supplier]);

  function updateField<K extends keyof SupplierFormData>(
    field: K,
    value: SupplierFormData[K]
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
        "Informe o nome do fornecedor."
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const normalizedData: SupplierFormData = {
        name: formData.name.trim(),
        document: formData.document.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        notes: formData.notes.trim()
      };

      if (supplier) {
        await updateSupplier(
          supplier.id,
          normalizedData
        );
      } else {
        await createSupplier(normalizedData);
      }

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o fornecedor.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="supplier-form"
      onSubmit={handleSubmit}
    >
      <div className="supplier-form-grid">
        <div className="supplier-field supplier-field-full">
          <label htmlFor="supplier-name">
            Nome
          </label>

          <input
            id="supplier-name"
            type="text"
            value={formData.name}
            onChange={event =>
              updateField(
                "name",
                event.target.value
              )
            }
            autoFocus
            required
          />
        </div>

        <div className="supplier-field">
          <label htmlFor="supplier-document">
            CPF/CNPJ
          </label>

          <input
            id="supplier-document"
            type="text"
            value={formData.document}
            onChange={event =>
              updateField(
                "document",
                event.target.value
              )
            }
          />
        </div>

        <div className="supplier-field">
          <label htmlFor="supplier-phone">
            Telefone
          </label>

          <input
            id="supplier-phone"
            type="text"
            value={formData.phone}
            onChange={event =>
              updateField(
                "phone",
                event.target.value
              )
            }
          />
        </div>

        <div className="supplier-field supplier-field-full">
          <label htmlFor="supplier-email">
            E-mail
          </label>

          <input
            id="supplier-email"
            type="email"
            value={formData.email}
            onChange={event =>
              updateField(
                "email",
                event.target.value
              )
            }
          />
        </div>

        <div className="supplier-field supplier-field-full">
          <label htmlFor="supplier-notes">
            Observações
          </label>

          <textarea
            id="supplier-notes"
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
        <div className="supplier-form-error">
          {errorMessage}
        </div>
      )}

      <div className="supplier-form-actions">
        <button
          type="button"
          className="supplier-button supplier-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="supplier-button supplier-button-primary"
          disabled={submitting}
        >
          {submitting
            ? "Salvando..."
            : supplier
              ? "Salvar alterações"
              : "Cadastrar fornecedor"}
        </button>
      </div>
    </form>
  );
}

export default SupplierForm;