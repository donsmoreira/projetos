import type {
  AccountWithBalance
} from "../../types/bankAccount";

import { formatAccountLabel } from "../../utils/bank";
import { formatCurrency } from "../../utils/currency";

type AccountOptionsProps = {
  accounts: AccountWithBalance[];
};

/**
 * Opções de <select> separadas em "Caixa (dinheiro físico)" e "Contas bancárias".
 */
function AccountOptions({
  accounts
}: AccountOptionsProps) {
  const cash = accounts.filter(account => account.account_type === "caixa");
  const banks = accounts.filter(account => account.account_type !== "caixa");

  return (
    <>
      {cash.length > 0 && (
        <optgroup label="Caixa (dinheiro físico)">
          {cash.map(account => (
            <option
              key={account.id}
              value={account.id}
            >
              {`${formatAccountLabel(account)} — saldo ${formatCurrency(account.balance)}`}
            </option>
          ))}
        </optgroup>
      )}

      {banks.length > 0 && (
        <optgroup label="Contas bancárias">
          {banks.map(account => (
            <option
              key={account.id}
              value={account.id}
            >
              {formatAccountLabel(account)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

type AccountBalanceHintProps = {
  account: AccountWithBalance | undefined;
  value: number;
  direction: "entrada" | "saida";
};

/**
 * Mostra o saldo do caixa escolhido e avisa quando não há dinheiro suficiente.
 */
export function AccountBalanceHint({
  account,
  value,
  direction
}: AccountBalanceHintProps) {
  if (!account || account.account_type !== "caixa") {
    return null;
  }

  const after =
    direction === "saida"
      ? account.balance - value
      : account.balance + value;

  const insufficient = direction === "saida" && after < 0;

  return (
    <small
      className={
        insufficient
          ? "account-balance-hint account-balance-hint-danger"
          : "account-balance-hint"
      }
    >
      {insufficient
        ? `Saldo insuficiente: o caixa tem ${formatCurrency(account.balance)}.`
        : `Saldo do caixa: ${formatCurrency(account.balance)} → depois: ${formatCurrency(after)}`}
    </small>
  );
}

export default AccountOptions;
