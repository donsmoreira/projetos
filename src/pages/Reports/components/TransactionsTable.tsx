import type {
  ReportTransaction
} from "../../../types/report";

type TransactionsTableProps = {
  transactions: ReportTransaction[];
};

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL"
    }
  );
}

function formatDate(value: string) {
  const [year, month, day] =
    value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatTransactionType(
  value: string
) {
  const labels: Record<string, string> = {
    payable_payment:
      "Pagamento de conta",

    receivable_receipt:
      "Recebimento de conta",

    manual:
      "Movimentação manual"
  };

  return labels[value] || value;
}

function TransactionsTable({
  transactions
}: TransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="reports-empty">
        <h3>
          Nenhuma movimentação encontrada
        </h3>

        <p>
          Altere o período ou o tipo de movimentação.
        </p>
      </div>
    );
  }

  return (
    <div className="reports-table-wrapper">
      <table className="reports-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Conta bancária</th>
            <th>Origem</th>
            <th>Tipo</th>

            <th className="reports-value-column">
              Valor
            </th>
          </tr>
        </thead>

        <tbody>
          {transactions.map(
            transaction => (
              <tr key={transaction.id}>
                <td>
                  {formatDate(
                    transaction.date
                  )}
                </td>

                <td>
                  <strong>
                    {transaction.description}
                  </strong>
                </td>

                <td>
                  <div className="reports-account-cell">
                    <span>
                      {transaction.accountName}
                    </span>

                    {transaction.accountBank && (
                      <small>
                        {transaction.accountBank}
                      </small>
                    )}
                  </div>
                </td>

                <td>
                  {formatTransactionType(
                    transaction.transactionType
                  )}
                </td>

                <td>
                  <span
                    className={`reports-transaction-type reports-transaction-${transaction.type}`}
                  >
                    {transaction.type ===
                    "entrada"
                      ? "Entrada"
                      : "Saída"}
                  </span>
                </td>

                <td
                  className={`reports-value reports-value-${transaction.type}`}
                >
                  {transaction.type ===
                  "entrada"
                    ? "+"
                    : "-"}{" "}
                  {formatCurrency(
                    transaction.value
                  )}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

export default TransactionsTable;