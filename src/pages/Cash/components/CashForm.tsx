import { useState } from "react";
import type { FormEvent } from "react";

import {
  createBankAccount,
  updateBankAccount
} from "../../../services/bankAccountsService";

import type { AccountWithBalance, CashRole } from "../../../types/bankAccount";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";

type CashFormProps = {
  cash: AccountWithBalance | null;
  existingNames: string[];
  /** Com turno aberto não dá para trocar a função do caixa */
  hasOpenSession?: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

function CashForm({
  cash,
  existingNames,
  hasOpenSession = false,
  onCancel,
  onSaved
}: CashFormProps) {
  const [name, setName] =
    useState(cash?.name ?? "");

  const [cashRole, setCashRole] =
    useState<CashRole>(cash?.cash_role ?? "operacao");

  const [initialBalance, setInitialBalance] =
    useState(cash?.initial_balance ?? 0);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = name.trim();

    if (!cleanName) {
      setErrorMessage("Informe o nome do caixa.");
      return;
    }

    const duplicated = existingNames.some(
      existing =>
        existing.trim().toLowerCase() === cleanName.toLowerCase() &&
        existing !== cash?.name
    );

    if (duplicated) {
      setErrorMessage("Já existe um caixa com esse nome.");
      return;
    }

    if (initialBalance < 0) {
      setErrorMessage("O saldo inicial do caixa não pode ser negativo.");
      return;
    }

    // Ao editar, o saldo inicial novo não pode deixar o saldo atual negativo
    if (cash) {
      const newBalance = cash.balance - cash.initial_balance + initialBalance;

      if (newBalance < 0) {
        setErrorMessage(
          "Com esse saldo inicial o caixa ficaria negativo, por causa das saídas já registradas."
        );
        return;
      }
    }

    const data = {
      accountType: "caixa" as const,
      cashRole,
      name: cleanName,
      bank: "",
      agency: "",
      accountNumber: "",
      initialBalance,
      overdraftLimit: 0
    };

    try {
      setSubmitting(true);
      setErrorMessage("");

      if (cash) {
        await updateBankAccount(cash.id, data);
      } else {
        await createBankAccount(data);
      }

      await onSaved();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o caixa."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="arc-form"
      onSubmit={handleSubmit}
    >
      <div className="arc-field">
        <label htmlFor="cash-name">
          Nome do caixa
        </label>

        <input
          id="cash-name"
          type="text"
          value={name}
          onChange={event => {
            setName(event.target.value);
            setErrorMessage("");
          }}
          placeholder="Ex.: Caixa principal, Carteira, Cofre..."
          maxLength={60}
          autoFocus
          required
        />
      </div>

      <div className="arc-field">
        <span className="arc-field-label">
          Função do caixa
        </span>

        <div
          className="arc-choice-group"
          role="radiogroup"
          aria-label="Função do caixa"
        >
          {([
            ["operacao", "Operação"],
            ["retaguarda", "Retaguarda (cofre)"]
          ] as [CashRole, string][]).map(([value, label]) => (
            <label
              key={value}
              className={[
                "arc-choice",
                cashRole === value ? "is-selected" : ""
              ].join(" ")}
            >
              <input
                type="radio"
                name="cash-role"
                value={value}
                checked={cashRole === value}
                disabled={hasOpenSession}
                onChange={() => setCashRole(value)}
              />
              {label}
            </label>
          ))}
        </div>

        <small className="arc-hint">
          {hasOpenSession
            ? "Feche o caixa antes de trocar a função."
            : cashRole === "operacao"
              ? "Caixa do dia a dia: abre conferindo o troco e fecha contando o dinheiro, em turnos."
              : "Cofre ou retaguarda: não abre nem fecha; recebe o dinheiro enviado nos fechamentos."}
        </small>
      </div>

      <div className="arc-field">
        <label htmlFor="cash-initial-balance">
          Saldo inicial (R$)
        </label>

        <CurrencyInput
          id="cash-initial-balance"
          value={initialBalance}
          onChange={value => {
            setInitialBalance(value);
            setErrorMessage("");
          }}
        />

        <small className="arc-hint">
          Quanto dinheiro em espécie havia neste caixa quando você começou a usar o sistema.
        </small>
      </div>

      {errorMessage && (
        <div className="arc-form-error">
          {errorMessage}
        </div>
      )}

      <div className="arc-form-actions">
        <button
          type="button"
          className="arc-button arc-button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="arc-button arc-button-primary"
          disabled={submitting}
        >
          {submitting
            ? "Salvando..."
            : cash
              ? "Salvar alterações"
              : "Cadastrar caixa"}
        </button>
      </div>
    </form>
  );
}

export default CashForm;
