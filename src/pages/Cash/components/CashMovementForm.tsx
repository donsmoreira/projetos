import { useState } from "react";
import type { FormEvent } from "react";

import {
  createBankTransaction,
  transferBetweenAccounts
} from "../../../services/bankAccountsService";

import type { AccountWithBalance } from "../../../types/bankAccount";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import { formatAccountLabel } from "../../../utils/bank";
import { formatCurrency } from "../../../utils/currency";

export type MovementKind =
  | "entrada"
  | "saida"
  | "transferencia";

type TransferDirection =
  | "saque"
  | "deposito";

type CashMovementFormProps = {
  cash: AccountWithBalance;
  initialKind: MovementKind;
  otherAccounts: AccountWithBalance[];
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
};

const KINDS: { value: MovementKind; label: string }[] = [
  { value: "entrada", label: "Entrada" },
  { value: "saida", label: "Saída" },
  { value: "transferencia", label: "Transferência" }
];

function getToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

function CashMovementForm({
  cash,
  initialKind,
  otherAccounts,
  onCancel,
  onSaved
}: CashMovementFormProps) {
  const [kind, setKind] =
    useState<MovementKind>(initialKind);

  const [direction, setDirection] =
    useState<TransferDirection>("saque");

  const [otherAccountId, setOtherAccountId] =
    useState("");

  const [date, setDate] =
    useState(getToday());

  const [value, setValue] =
    useState(0);

  const [description, setDescription] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const otherAccount = otherAccounts.find(
    account => account.id === otherAccountId
  );

  // Dinheiro saindo do caixa: saída avulsa ou depósito no banco
  const leavesCash =
    kind === "saida" ||
    (kind === "transferencia" && direction === "deposito");

  const balanceAfter = leavesCash
    ? cash.balance - value
    : cash.balance + value;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!date) {
      setErrorMessage("Informe a data.");
      return;
    }

    if (value <= 0) {
      setErrorMessage("Informe um valor maior que zero.");
      return;
    }

    if (kind !== "transferencia" && !description.trim()) {
      setErrorMessage("Descreva a movimentação (ex.: troco inicial, compra de material).");
      return;
    }

    if (kind === "transferencia" && !otherAccount) {
      setErrorMessage("Escolha a conta bancária da transferência.");
      return;
    }

    if (leavesCash && balanceAfter < 0) {
      setErrorMessage(
        `Saldo insuficiente: o caixa tem ${formatCurrency(cash.balance)}.`
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      if (kind === "transferencia" && otherAccount) {
        await transferBetweenAccounts({
          fromAccountId: direction === "saque" ? otherAccount.id : cash.id,
          toAccountId: direction === "saque" ? cash.id : otherAccount.id,
          date,
          value,
          description:
            description.trim() ||
            (direction === "saque"
              ? `Saque de ${formatAccountLabel(otherAccount)} para ${cash.name}`
              : `Depósito de ${cash.name} em ${formatAccountLabel(otherAccount)}`)
        });
      } else {
        await createBankTransaction({
          bankAccountId: cash.id,
          date,
          description: description.trim(),
          value: kind === "saida" ? -value : value
        });
      }

      await onSaved();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a movimentação."
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
        <span className="arc-field-label">
          Tipo de movimentação
        </span>

        <div
          className="arc-choice-group"
          role="radiogroup"
          aria-label="Tipo de movimentação"
        >
          {KINDS.map(option => (
            <label
              key={option.value}
              className={[
                "arc-choice",
                `arc-choice-${option.value}`,
                kind === option.value ? "is-selected" : ""
              ].join(" ")}
            >
              <input
                type="radio"
                name="cash-movement-kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => {
                  setKind(option.value);
                  setErrorMessage("");
                }}
              />
              {option.label}
            </label>
          ))}
        </div>

        <small className="arc-hint">
          {kind === "entrada" && "Dinheiro que entrou no caixa sem ser de uma conta a receber (ex.: troco inicial, reforço)."}
          {kind === "saida" && "Dinheiro que saiu do caixa sem ser de uma conta a pagar (ex.: pequena despesa, retirada)."}
          {kind === "transferencia" && "Saque do banco para o caixa, ou depósito do caixa no banco. Não conta como receita nem despesa."}
        </small>
      </div>

      {kind === "transferencia" && (
        <div className="arc-form-grid">
          <div className="arc-field">
            <label htmlFor="cash-transfer-direction">
              Direção
            </label>

            <select
              id="cash-transfer-direction"
              value={direction}
              onChange={event => {
                setDirection(event.target.value as TransferDirection);
                setErrorMessage("");
              }}
            >
              <option value="saque">
                Saque: banco → caixa
              </option>
              <option value="deposito">
                Depósito: caixa → banco
              </option>
            </select>
          </div>

          <div className="arc-field">
            <label htmlFor="cash-transfer-account">
              Conta bancária
            </label>

            <select
              id="cash-transfer-account"
              value={otherAccountId}
              onChange={event => {
                setOtherAccountId(event.target.value);
                setErrorMessage("");
              }}
              required
            >
              <option value="">
                {otherAccounts.length === 0
                  ? "Nenhuma conta bancária cadastrada"
                  : "Selecione a conta"}
              </option>

              {otherAccounts.map(account => (
                <option
                  key={account.id}
                  value={account.id}
                >
                  {formatAccountLabel(account)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="arc-form-grid">
        <div className="arc-field">
          <label htmlFor="cash-movement-date">
            Data
          </label>

          <input
            id="cash-movement-date"
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            required
          />
        </div>

        <div className="arc-field">
          <label htmlFor="cash-movement-value">
            Valor (R$)
          </label>

          <CurrencyInput
            id="cash-movement-value"
            value={value}
            onChange={newValue => {
              setValue(newValue);
              setErrorMessage("");
            }}
            required
          />
        </div>
      </div>

      <div className="arc-field">
        <label htmlFor="cash-movement-description">
          Descrição{kind === "transferencia" ? " (opcional)" : ""}
        </label>

        <input
          id="cash-movement-description"
          type="text"
          value={description}
          onChange={event => {
            setDescription(event.target.value);
            setErrorMessage("");
          }}
          placeholder={
            kind === "entrada"
              ? "Ex.: Troco inicial do dia"
              : kind === "saida"
                ? "Ex.: Compra de café para o escritório"
                : "Ex.: Saque para pagamentos da semana"
          }
          maxLength={140}
        />
      </div>

      <small className={balanceAfter < 0 ? "account-balance-hint account-balance-hint-danger" : "account-balance-hint"}>
        Saldo do caixa: {formatCurrency(cash.balance)} → depois: {formatCurrency(balanceAfter)}
      </small>

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
          {submitting ? "Registrando..." : "Registrar"}
        </button>
      </div>
    </form>
  );
}

export default CashMovementForm;
