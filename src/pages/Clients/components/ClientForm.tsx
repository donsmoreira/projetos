import {
  useEffect,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  createClient,
  updateClient
} from "../../../services/clientsService";

import type {
  Client,
  ClientFormData,
  ClientType
} from "../../../types/client";

import type { AddressFormData } from "../../../types/address";
import { EMPTY_ADDRESS } from "../../../types/address";

import {
  addressFromDb,
  validateAddress
} from "../../../utils/address";

import AddressSection from "../../../components/AddressSection/AddressSection";

type ClientFormProps = {
  client: Client | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const emptyForm: ClientFormData = {
  name: "",
  type: null,
  document: "",
  phone: "",
  email: "",
  notes: "",
  address: EMPTY_ADDRESS
};

function ClientForm({
  client,
  onCancel,
  onSaved
}: ClientFormProps) {
  const [formData, setFormData] =
    useState<ClientFormData>(emptyForm);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name,
        type: client.type,
        document: client.document ?? "",
        phone: client.phone ?? "",
        email: client.email ?? "",
        notes: client.notes ?? "",
        address: addressFromDb(client)
      });
    } else {
      setFormData(emptyForm);
    }

    setErrorMessage("");
  }, [client]);

  function updateField<K extends keyof ClientFormData>(
    field: K,
    value: ClientFormData[K]
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

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!formData.name.trim()) {
      setErrorMessage(
        "Informe o nome do cliente."
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

      const normalizedData: ClientFormData = {
        ...formData,
        name: formData.name.trim(),
        document: formData.document.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        notes: formData.notes.trim()
      };

      if (client) {
        await updateClient(
          client.id,
          normalizedData
        );
      } else {
        await createClient(normalizedData);
      }

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o cliente.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="client-form"
      onSubmit={handleSubmit}
    >
      <div className="client-form-grid">
        <div className="client-field client-field-full">
          <label htmlFor="client-name">
            Nome
          </label>

          <input
            id="client-name"
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

        <div className="client-field">
          <label htmlFor="client-type">
            Tipo
          </label>

          <select
            id="client-type"
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

        <div className="client-field">
          <label htmlFor="client-document">
            CPF/CNPJ
          </label>

          <input
            id="client-document"
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

        <div className="client-field">
          <label htmlFor="client-phone">
            Telefone
          </label>

          <input
            id="client-phone"
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

        <div className="client-field">
          <label htmlFor="client-email">
            E-mail
          </label>

          <input
            id="client-email"
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
          classPrefix="client"
          idPrefix="client"
        />

        <div className="client-field client-field-full">
          <label htmlFor="client-notes">
            Observações
          </label>

          <textarea
            id="client-notes"
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
        <div className="client-form-error">
          {errorMessage}
        </div>
      )}

      <div className="client-form-actions">
        <button
          type="button"
          className="client-button client-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="client-button client-button-primary"
          disabled={submitting}
        >
          {submitting
            ? "Salvando..."
            : client
              ? "Salvar alterações"
              : "Cadastrar cliente"}
        </button>
      </div>
    </form>
  );
}

export default ClientForm;