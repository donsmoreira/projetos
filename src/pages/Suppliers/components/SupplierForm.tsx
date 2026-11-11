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

import type { AddressFormData } from "../../../types/address";
import { EMPTY_ADDRESS } from "../../../types/address";

import {
  addressFromDb,
  validateAddress
} from "../../../utils/address";

import AddressSection from "../../../components/AddressSection/AddressSection";
import {
  CnpjLookupHint,
  CnpjLookupMessage
} from "../../../components/CnpjLookup/CnpjLookupInfo";
import { useCnpjLookup } from "../../../hooks/useCnpjLookup";
import CompanyDataFields from "../../../components/CnpjLookup/CompanyDataFields";
import {
  documentKind,
  formatDocument
} from "../../../utils/document";
import type { ClientType } from "../../../types/client";

type SupplierFormProps = {
  supplier: Supplier | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const emptyForm: SupplierFormData = {
  name: "",
  document: "",
  tradeName: "",
  stateRegistration: "",
  taxRegime: "",
  type: null,
  phone: "",
  email: "",
  notes: "",
  address: EMPTY_ADDRESS
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
        tradeName: supplier.trade_name ?? "",
        stateRegistration: supplier.state_registration ?? "",
        taxRegime: supplier.tax_regime ?? "",
        type: supplier.type ?? null,
        phone: supplier.phone ?? "",
        email: supplier.email ?? "",
        notes: supplier.notes ?? "",
        address: addressFromDb(supplier)
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

  function updateAddress(
    update: (current: AddressFormData) => AddressFormData
  ) {
    setFormData(current => ({
      ...current,
      address: update(current.address)
    }));
  }

  // Busca do CNPJ na Receita: preenche o que vier
  const receita = useCnpjLookup(result => {
    setFormData(current => ({
      ...current,
      name: result.name || current.name,
      tradeName: result.tradeName || current.tradeName,
      type: "Pessoa Jurídica",
      stateRegistration: result.stateRegistration || current.stateRegistration,
      taxRegime: result.taxRegime || current.taxRegime,
      // Telefone e e-mail da Receita costumam ser do contador: só se estiver vazio
      phone: current.phone.trim() ? current.phone : result.phone,
      email: current.email.trim() ? current.email : result.email,
      address: result.address.zipCode || result.address.street
        ? result.address
        : current.address
    }));
  });

  function handleDocumentChange(value: string) {
    const formatted = formatDocument(value);
    const kind = documentKind(formatted);

    setFormData(current => ({
      ...current,
      document: formatted,
      // 11 números = CPF (pessoa física); 14 = CNPJ (pessoa jurídica)
      type: kind === "cnpj"
        ? "Pessoa Jurídica"
        : kind === "cpf"
          ? "Pessoa Física"
          : current.type
    }));

    receita.handleDocumentChange(formatted);
  }

  // Campos de empresa (razão social, fantasia, enquadramento, IE) para CNPJ ou PJ
  const isPj =
    formData.type === "Pessoa Jurídica" ||
    documentKind(formData.document) === "cnpj";

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

    const addressError = validateAddress(formData.address);

    if (addressError) {
      setErrorMessage(addressError);
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const normalizedData: SupplierFormData = {
        name: formData.name.trim(),
        document: formData.document.trim(),
        type: formData.type,
        // Pessoa física não guarda dados de empresa
        tradeName: isPj ? formData.tradeName.trim() : "",
        stateRegistration: isPj ? formData.stateRegistration.trim() : "",
        taxRegime: isPj ? formData.taxRegime : "",
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        notes: formData.notes.trim(),
        address: formData.address
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
        <div className="supplier-field">
          <label htmlFor="supplier-type">
            Tipo
          </label>

          <select
            id="supplier-type"
            value={formData.type ?? ""}
            onChange={event =>
              updateField(
                "type",
                event.target.value
                  ? event.target.value as ClientType
                  : null
              )
            }
          >
            <option value="">
              Não informado
            </option>

            <option value="Pessoa Física">
              Pessoa Física
            </option>

            <option value="Pessoa Jurídica">
              Pessoa Jurídica
            </option>
          </select>
        </div>

        <div className="supplier-field">
          <label htmlFor="supplier-document">
            CPF/CNPJ
          </label>

          <input
            id="supplier-document"
            type="text"
            inputMode="numeric"
            value={formData.document}
            onChange={event =>
              handleDocumentChange(event.target.value)
            }
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            maxLength={18}
            autoFocus
          />

          <CnpjLookupHint
            document={formData.document}
            lookup={receita}
          />
        </div>

        <CnpjLookupMessage lookup={receita} />

        <div className="supplier-field supplier-field-full">
          <label htmlFor="supplier-name">
            {isPj ? "Razão social" : "Nome"}
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
            required
          />
        </div>

        {isPj && (
          <CompanyDataFields
            classPrefix="supplier"
            idPrefix="supplier"
            tradeName={formData.tradeName}
            taxRegime={formData.taxRegime}
            stateRegistration={formData.stateRegistration}
            onChange={(field, value) =>
              setFormData(current => ({ ...current, [field]: value }))
            }
          />
        )}

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

        <AddressSection
          value={formData.address}
          onChange={updateAddress}
          classPrefix="supplier"
          idPrefix="supplier"
        />

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