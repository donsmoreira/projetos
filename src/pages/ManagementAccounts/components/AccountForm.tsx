import {
  useMemo,
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  createManagementAccount,
  updateManagementAccount
} from "../../../services/managementAccountsService";

import type {
  ManagementAccount,
  ManagementAccountFormData,
  ManagementAccountNature,
  ManagementAccountType
} from "../../../types/managementAccount";

import {
  ACCOUNT_NATURE_LABELS,
  ACCOUNT_TYPE_LABELS
} from "../../../types/managementAccount";

import {
  buildAccountTree,
  flattenAccountTree,
  getDescendantIds,
  hasSiblingWithName
} from "../../../utils/accountTree";

type AccountFormProps = {
  account: ManagementAccount | null;
  defaultParentId: string | null;
  accounts: ManagementAccount[];
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const TYPES: ManagementAccountType[] = ["receita", "despesa"];
const NATURES: ManagementAccountNature[] = ["fixa", "variavel"];

function getInitialData(
  account: ManagementAccount | null,
  defaultParentId: string | null,
  accounts: ManagementAccount[]
): ManagementAccountFormData {
  if (account) {
    return {
      name: account.name,
      type: account.type,
      nature: account.nature,
      parentId: account.parent_id ?? ""
    };
  }

  const parent = accounts.find(item => item.id === defaultParentId);

  return {
    name: "",
    type: parent?.type ?? "",
    nature: parent?.nature ?? "",
    parentId: parent?.id ?? ""
  };
}

function AccountForm({
  account,
  defaultParentId,
  accounts,
  onCancel,
  onSaved
}: AccountFormProps) {
  const [formData, setFormData] =
    useState<ManagementAccountFormData>(() =>
      getInitialData(account, defaultParentId, accounts)
    );

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  // Conta pai: não pode ser a própria conta nem uma filha dela
  const parentOptions = useMemo(() => {
    const blocked = account
      ? getDescendantIds(accounts, account.id)
      : new Set<string>();

    if (account) {
      blocked.add(account.id);
    }

    return flattenAccountTree(buildAccountTree(accounts))
      .filter(option => !blocked.has(option.account.id));
  }, [account, accounts]);

  const selectedParent = accounts.find(
    item => item.id === formData.parentId
  );

  const hasChildren = account
    ? accounts.some(item => item.parent_id === account.id)
    : false;

  const typeLocked = Boolean(selectedParent) || hasChildren;

  function updateField<K extends keyof ManagementAccountFormData>(
    field: K,
    value: ManagementAccountFormData[K]
  ) {
    setErrorMessage("");
    setFormData(current => ({
      ...current,
      [field]: value
    }));
  }

  function handleParentChange(parentId: string) {
    const parent = accounts.find(item => item.id === parentId);

    setErrorMessage("");
    setFormData(current => ({
      ...current,
      parentId,
      // A subconta herda o tipo da conta pai
      type: parent ? parent.type : current.type
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const name = formData.name.trim();

    if (!name) {
      setErrorMessage("Informe o nome da conta.");
      return;
    }

    if (!formData.type) {
      setErrorMessage("Escolha se a conta é de receita ou despesa.");
      return;
    }

    if (!formData.nature) {
      setErrorMessage("Escolha se a conta é fixa ou variável.");
      return;
    }

    if (account && hasChildren && formData.type !== account.type) {
      setErrorMessage(
        `Esta conta tem subcontas de ${ACCOUNT_TYPE_LABELS[account.type].toLowerCase()} e só pode ficar dentro de uma conta de ${ACCOUNT_TYPE_LABELS[account.type].toLowerCase()}.`
      );
      return;
    }

    if (selectedParent && selectedParent.type !== formData.type) {
      setErrorMessage("A subconta precisa ser do mesmo tipo da conta pai.");
      return;
    }

    if (
      hasSiblingWithName(
        accounts,
        name,
        formData.parentId || null,
        account?.id
      )
    ) {
      setErrorMessage("Já existe uma conta com esse nome nesse mesmo nível.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      const data = {
        ...formData,
        name
      };

      if (account) {
        await updateManagementAccount(account.id, data);
      } else {
        await createManagementAccount(data);
      }

      await onSaved();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a conta."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="account-form"
      onSubmit={handleSubmit}
    >
      <div className="account-field">
        <label htmlFor="account-parent">
          Conta pai
        </label>

        <select
          id="account-parent"
          value={formData.parentId}
          onChange={event =>
            handleParentChange(event.target.value)
          }
        >
          <option value="">
            Nenhuma (conta principal)
          </option>

          {parentOptions.map(option => (
            <option
              key={option.account.id}
              value={option.account.id}
            >
              {`${"   ".repeat(option.depth)}${option.account.name} (${ACCOUNT_TYPE_LABELS[option.account.type]})`}
            </option>
          ))}
        </select>

        <small className="account-hint">
          Deixe "Nenhuma" para criar uma conta principal, ou escolha a conta onde esta vai ficar dentro.
        </small>
      </div>

      <div className="account-field">
        <label htmlFor="account-name">
          Nome da conta
        </label>

        <input
          id="account-name"
          type="text"
          value={formData.name}
          onChange={event =>
            updateField("name", event.target.value)
          }
          placeholder="Ex.: RECEITA TRABALHO, Empresa X, Aluguel..."
          maxLength={120}
          autoFocus
          required
        />
      </div>

      <div className="account-field">
        <span className="account-field-label">
          Tipo
        </span>

        <div
          className="account-choice-group"
          role="radiogroup"
          aria-label="Tipo"
        >
          {TYPES.map(type => (
            <label
              key={type}
              className={[
                "account-choice",
                `account-choice-${type}`,
                formData.type === type ? "is-selected" : "",
                typeLocked ? "is-locked" : ""
              ].join(" ")}
            >
              <input
                type="radio"
                name="account-type"
                value={type}
                checked={formData.type === type}
                onChange={() => updateField("type", type)}
                disabled={typeLocked}
              />
              {ACCOUNT_TYPE_LABELS[type]}
            </label>
          ))}
        </div>

        {selectedParent && (
          <small className="account-hint">
            Herdado da conta pai "{selectedParent.name}".
          </small>
        )}

        {!selectedParent && hasChildren && (
          <small className="account-hint">
            Esta conta tem subcontas, então o tipo não pode ser trocado.
          </small>
        )}
      </div>

      <div className="account-field">
        <span className="account-field-label">
          Fixa ou variável
        </span>

        <div
          className="account-choice-group"
          role="radiogroup"
          aria-label="Fixa ou variável"
        >
          {NATURES.map(nature => (
            <label
              key={nature}
              className={[
                "account-choice",
                formData.nature === nature ? "is-selected" : ""
              ].join(" ")}
            >
              <input
                type="radio"
                name="account-nature"
                value={nature}
                checked={formData.nature === nature}
                onChange={() => updateField("nature", nature)}
              />
              {ACCOUNT_NATURE_LABELS[nature]}
            </label>
          ))}
        </div>

        <small className="account-hint">
          Fixa: se repete com o mesmo valor (aluguel, salário). Variável: muda de um mês para outro.
        </small>
      </div>

      {errorMessage && (
        <div className="account-form-error">
          {errorMessage}
        </div>
      )}

      <div className="account-form-actions">
        <button
          type="button"
          className="account-button account-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="account-button account-button-primary"
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

export default AccountForm;
