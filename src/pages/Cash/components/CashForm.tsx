import { useState } from "react";
import type { FormEvent } from "react";

import {
  createBankAccount,
  updateBankAccount
} from "../../../services/bankAccountsService";

import type { AccountWithBalance, CashRole } from "../../../types/bankAccount";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import { formatCurrency } from "../../../utils/currency";

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

  // Caixa novo: informa o dinheiro com que começa.
  // Caixa já cadastrado: o saldo NÃO se edita; só muda por suprimento, sangria,
  // pagamentos, recebimentos, transferências e fechamento.
  const [currentBalance, setCurrentBalance] =
    useState(0);

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

    if (!cash && currentBalance < 0) {
      setErrorMessage("O saldo do caixa não pode ser negativo.");
      return;
    }

    // Editando: mantém o saldo inicial que já existe (o saldo não muda aqui)
    const initialBalance = cash
      ? Number(cash.initial_balance || 0)
      : Math.round(currentBalance * 100) / 100;

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

      {cash ? (
        <div className="arc-field">
          <span className="arc-field-label">
            Saldo atual
          </span>

          <strong className={`cash-form-balance${cash.balance < 0 ? " is-negative" : ""}`}>
            {formatCurrency(cash.balance)}
          </strong>

          <small className="arc-hint">
            O saldo do caixa não se edita. Para colocar dinheiro, use <strong>Suprimento</strong>; para tirar, use <strong>Sangria</strong>.
          </small>
        </div>
      ) : (
        <div className="arc-field">
          <label htmlFor="cash-initial-balance">
            Saldo inicial (R$)
          </label>

          <CurrencyInput
            id="cash-initial-balance"
            value={currentBalance}
            onChange={value => {
              setCurrentBalance(value);
              setErrorMessage("");
            }}
          />

          <small className="arc-hint">
            Dinheiro em espécie com que o caixa começa. Depois de cadastrado, o saldo só muda por suprimento, sangria, pagamentos, recebimentos e fechamento.
          </small>
        </div>
      )}

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
