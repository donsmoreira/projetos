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
import {
  CnpjLookupHint,
  CnpjLookupMessage
} from "../../../components/CnpjLookup/CnpjLookupInfo";
import { useCnpjLookup } from "../../../hooks/useCnpjLookup";
import {
  documentKind,
  formatDocument
} from "../../../utils/document";

type ClientFormProps = {
  client: Client | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const emptyForm: ClientFormData = {
  name: "",
  type: null,
  document: "",
  tradeName: "",
  stateRegistration: "",
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
        tradeName: client.trade_name ?? "",
        stateRegistration: client.state_registration ?? "",
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

  // Busca do CNPJ na Receita: preenche o que vier
  const receita = useCnpjLookup(result => {
    setFormData(current => ({
      ...current,
      name: result.name || current.name,
      type: "Pessoa Jurídica",
      tradeName: result.tradeName || current.tradeName,
      stateRegistration: result.stateRegistration || current.stateRegistration,
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
            Nome / razão social
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
            inputMode="numeric"
            value={formData.document}
            onChange={event =>
              handleDocumentChange(event.target.value)
            }
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            maxLength={18}
          />

          <CnpjLookupHint
            document={formData.document}
            lookup={receita}
          />
        </div>

        <CnpjLookupMessage lookup={receita} />

        <div className="client-field">
          <label htmlFor="client-trade-name">
            Nome fantasia
          </label>

          <input
            id="client-trade-name"
            type="text"
            value={formData.tradeName}
            onChange={event =>
              updateField(
                "tradeName",
                event.target.value
              )
            }
          />
        </div>

        <div className="client-field">
          <label htmlFor="client-ie">
            Inscrição estadual
          </label>

          <input
            id="client-ie"
            type="text"
            value={formData.stateRegistration}
            onChange={event =>
              updateField(
                "stateRegistration",
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