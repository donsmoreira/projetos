import {
  Pencil,
  Trash2
} from "lucide-react";

import type {
  AccountWithBalance,
  BankAccount
} from "../../../types/bankAccount";

import { formatAccountBank } from "../../../utils/bank";

type BankAccountTableProps = {
  accounts: AccountWithBalance[];
  onEdit?: (account: BankAccount) => void;
  onDelete?: (account: BankAccount) => void;
};

function displayValue(
  value: string | null | undefined
) {
  return value?.trim() || "—";
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL"
    }
  );
}

function BankAccountTable({
  accounts,
  onEdit,
  onDelete
}: BankAccountTableProps) {
  if (accounts.length === 0) {
    return (
      <div className="bank-accounts-empty">
        <h3>Nenhuma conta bancária encontrada</h3>

        <p>
          Cadastre uma conta ou altere os termos da pesquisa.
        </p>
      </div>
    );
  }

  return (
    <div className="bank-accounts-table-wrapper">
      <table className="bank-accounts-table">
        <thead>
          <tr>
            <th>Banco</th>
            <th>Agência</th>
            <th>Conta</th>
            <th className="bank-accounts-value-column">
              Saldo atual
            </th>
            <th className="bank-accounts-value-column">
              Limite
            </th>
            <th className="bank-accounts-actions-column">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          {accounts.map(account => {
            const bankLabel =
              formatAccountBank(account);

            return (
            <tr key={account.id}>
              <td>
                <strong>{bankLabel || "—"}</strong>
              </td>

              <td>
                {displayValue(account.agency)}
              </td>

              <td>
                {displayValue(
                  account.account_number
                )}
              </td>

              <td className="bank-accounts-value">
                {formatCurrency(
                  account.balance
                )}
              </td>

              <td className="bank-accounts-value">
                {formatCurrency(
                  account.overdraft_limit
                )}
              </td>

              <td className="bank-accounts-actions">
                <>{onEdit && (
<button
                  type="button"
                  className="bank-accounts-action-button"
                  onClick={() => onEdit(account)}
                  title={`Editar ${bankLabel}`}
                  aria-label={`Editar ${bankLabel}`}
                >
                  <Pencil size={16} />
                </button>
)}</>

                <>{onDelete && (
<button
                  type="button"
                  className="bank-accounts-action-button bank-accounts-action-danger"
                  onClick={() => onDelete(account)}
                  title={`Excluir ${bankLabel}`}
                  aria-label={`Excluir ${bankLabel}`}
                >
                  <Trash2 size={16} />
                </button>
)}</>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default BankAccountTable;