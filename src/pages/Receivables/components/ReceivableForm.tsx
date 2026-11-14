import {
  useEffect,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  createReceivables,
  updateReceivable
} from "../../../services/receivablesService";

import {
  listClients
} from "../../../services/clientsService";

import type {
  Receivable,
  ReceivableFormData
} from "../../../types/receivable";

import type {
  Client
} from "../../../types/client";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import ManagementAccountSelect from "../../../components/ManagementAccountSelect/ManagementAccountSelect";
import InstallmentOrContract from "../../../components/InstallmentOrContract/InstallmentOrContract";

type ReceivableFormProps = {
  receivable: Receivable | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function getToday() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

const emptyForm: ReceivableFormData = {
  clientId: "",
  description: "",
  category: "",
  managementAccountId: "",
  value: 0,
  interest: 0,
  penalty: 0,
  issueDate: getToday(),
  dueDate: getToday(),
  notes: "",
  installmentCount: 1,
  isContract: false,
  contractMonths: 0
};

function ReceivableForm({
  receivable,
  onCancel,
  onSaved
}: ReceivableFormProps) {
  const [formData, setFormData] =
    useState<ReceivableFormData>(
      emptyForm
    );

  const [clients, setClients] =
    useState<Client[]>([]);

  const [loadingClients, setLoadingClients] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    async function loadClientOptions() {
      try {
        setLoadingClients(true);

        const data =
          await listClients();

        setClients(data);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os clientes.";

        setErrorMessage(message);
      } finally {
        setLoadingClients(false);
      }
    }

    loadClientOptions();
  }, []);

  useEffect(() => {
    if (receivable) {
      setFormData({
        clientId:
          receivable.client_id,

        description:
          receivable.description,

        category:
          receivable.category ?? "",

        managementAccountId:
          receivable.management_account_id ?? "",

        value:
          Number(
            receivable.original_value || 0
          ),

        interest:
          Number(
            receivable.interest || 0
          ),

        penalty:
          Number(
            receivable.penalty || 0
          ),

        issueDate:
          receivable.issue_date,

        dueDate:
          receivable.due_date,

        notes:
          receivable.notes ?? "",

        installmentCount: 1,
        isContract: false,
        contractMonths: 0
      });
    } else {
      setFormData({
        ...emptyForm,
        issueDate: getToday(),
        dueDate: getToday()
      });
    }

    setErrorMessage("");
  }, [receivable]);

  function updateField<
    K extends keyof ReceivableFormData
  >(
    field: K,
    value: ReceivableFormData[K]
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

    if (!formData.clientId) {
      setErrorMessage(
        "Selecione o cliente."
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

    if (
      !receivable &&
      formData.isContract &&
      (formData.contractMonths < 2 || formData.contractMonths > 120)
    ) {
      setErrorMessage(
        "Contrato: informe de 2 a 120 meses."
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const normalizedData: ReceivableFormData = {
        clientId:
          formData.clientId,

        description:
          formData.description.trim(),

        category:
          formData.category.trim(),

        managementAccountId:
          formData.managementAccountId,

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
          formData.isContract
            ? 1
            : Math.max(
                Number(
                  formData.installmentCount || 1
                ),
                1
              ),

        isContract:
          formData.isContract,

        contractMonths:
          formData.isContract
            ? formData.contractMonths
            : 0
      };

      if (receivable) {
        await updateReceivable(
          receivable.id,
          normalizedData
        );
      } else {
        await createReceivables(
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
      className="receivable-form"
      onSubmit={handleSubmit}
    >
      <div className="receivable-form-grid">
        <div className="receivable-field receivable-field-full">
          <label htmlFor="receivable-client">
            Cliente
          </label>

          <select
            id="receivable-client"
            value={formData.clientId}
            onChange={event =>
              updateField(
                "clientId",
                event.target.value
              )
            }
            disabled={loadingClients}
            required
          >
            <option value="">
              {loadingClients
                ? "Carregando clientes..."
                : "Selecione o cliente"}
            </option>

            {clients
              // Inativos não aparecem (a não ser o que já está neste lançamento)
              .filter(client => client.active !== false || client.id === formData.clientId)
              .map(client => (
              <option
                key={client.id}
                value={client.id}
              >
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="receivable-field receivable-field-full">
          <label htmlFor="receivable-description">
            Descrição
          </label>

          <input
            id="receivable-description"
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

        <div className="receivable-field receivable-field-full">
          <label htmlFor="receivable-management-account">
            Conta gerencial (receita) <small>· opcional</small>
          </label>

          <ManagementAccountSelect
            id="receivable-management-account"
            type="receita"
            value={formData.managementAccountId}
            onChange={(accountId, path) =>
              setFormData(current => ({
                ...current,
                managementAccountId: accountId,
                category: path
              }))
            }
          />

          {receivable &&
            !receivable.management_account_id &&
            receivable.category && (
              <small className="management-account-hint">
                Categoria antiga: "{receivable.category}". Se quiser, escolha a conta gerencial correspondente.
              </small>
            )}
        </div>

        <div className="receivable-field">
          <label htmlFor="receivable-value">
            {formData.isContract
              ? "Valor mensal (R$)"
              : formData.installmentCount > 1
                ? "Valor de cada parcela (R$)"
                : "Valor (R$)"}
          </label>

          <CurrencyInput
            id="receivable-value"
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

        <InstallmentOrContract
          prefix="receivable"
          installmentCount={formData.installmentCount}
          isContract={formData.isContract}
          contractMonths={formData.contractMonths}
          valuePerEntry={
            Number(formData.value || 0) +
            Number(formData.interest || 0) +
            Number(formData.penalty || 0)
          }
          disabled={Boolean(receivable)}
          onInstallmentCountChange={value =>
            updateField("installmentCount", value)
          }
          onContractChange={checked =>
            setFormData(current => ({
              ...current,
              isContract: checked,
              installmentCount: 1,
              contractMonths: checked ? current.contractMonths || 12 : 0
            }))
          }
          onContractMonthsChange={months =>
            updateField("contractMonths", months)
          }
        />

        <div className="receivable-field">
          <label htmlFor="receivable-interest">
            Juros (R$)
          </label>

          <CurrencyInput
            id="receivable-interest"
            value={formData.interest}
            onChange={value =>
              updateField(
                "interest",
                value
              )
            }
          />
        </div>

        <div className="receivable-field">
          <label htmlFor="receivable-penalty">
            Multa (R$)
          </label>

          <CurrencyInput
            id="receivable-penalty"
            value={formData.penalty}
            onChange={value =>
              updateField(
                "penalty",
                value
              )
            }
          />
        </div>

        <div className="receivable-field">
          <label htmlFor="receivable-issue-date">
            Data de emissão
          </label>

          <input
            id="receivable-issue-date"
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

        <div className="receivable-field">
          <label htmlFor="receivable-due-date">
            Primeiro vencimento
          </label>

          <input
            id="receivable-due-date"
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

        <div className="receivable-field receivable-field-full">
          <label htmlFor="receivable-notes">
            Observações
          </label>

          <textarea
            id="receivable-notes"
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
        <div className="receivable-form-error">
          {errorMessage}
        </div>
      )}

      <div className="receivable-form-actions">
        <button
          type="button"
          className="receivable-button receivable-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="receivable-button receivable-button-primary"
          disabled={submitting}
        >
          {submitting
            ? "Salvando..."
            : receivable
              ? "Salvar alterações"
              : "Cadastrar conta"}
        </button>
      </div>
    </form>
  );
}

export default ReceivableForm;