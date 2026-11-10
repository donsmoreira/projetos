import {
  CircleDollarSign,
  Pencil,
  RotateCcw,
  Trash2
} from "lucide-react";

import type {
  Payable
} from "../../../types/payable";

type PayableTableProps = {
  payables: Payable[];
  onEdit: (payable: Payable) => void;
  onDelete: (payable: Payable) => void;
  onPay: (payable: Payable) => void;
  onReverse: (payable: Payable) => void;
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

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const [year, month, day] =
    value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function getPayableTotal(
  payable: Payable
) {
  return (
    Number(payable.original_value || 0) +
    Number(payable.interest || 0) +
    Number(payable.penalty || 0)
  );
}

function PayableTable({
  payables,
  onEdit,
  onDelete,
  onPay,
  onReverse
}: PayableTableProps) {
  if (payables.length === 0) {
    return (
      <div className="payables-empty">
        <h3>Nenhuma conta encontrada</h3>

        <p>
          Cadastre uma conta ou altere os filtros da pesquisa.
        </p>
      </div>
    );
  }

  return (
    <div className="payables-table-wrapper">
      <table className="payables-table">
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>Descrição</th>
            <th>Conta gerencial</th>
            <th>Vencimento</th>
            <th>Parcela</th>

            <th className="payables-value-column">
              Total
            </th>

            <th>Status</th>

            <th className="payables-actions-column">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          {payables.map(payable => {
            const isPending =
              payable.status === "pendente";

            return (
              <tr key={payable.id}>
                <td>
                  <strong>
                    {payable.suppliers?.name ||
                      "Fornecedor não informado"}
                  </strong>
                </td>

                <td>{payable.description}</td>

                <td>
                  {payable.category || "—"}
                </td>

                <td>
                  {formatDate(
                    payable.due_date
                  )}
                </td>

                <td>
                  {payable.installment_count > 1
                    ? `${payable.installment_index}/${payable.installment_count}`
                    : "Única"}
                </td>

                <td className="payables-value">
                  {formatCurrency(
                    getPayableTotal(payable)
                  )}
                </td>

                <td>
                  <span
                    className={`payables-status payables-status-${payable.status}`}
                  >
                    {isPending
                      ? "Pendente"
                      : "Pago"}
                  </span>
                </td>

                <td className="payables-actions">
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        className="payables-action-button payables-action-pay"
                        onClick={() =>
                          onPay(payable)
                        }
                        title="Registrar pagamento"
                        aria-label={`Pagar ${payable.description}`}
                      >
                        <CircleDollarSign
                          size={16}
                        />
                      </button>

                      <button
                        type="button"
                        className="payables-action-button"
                        onClick={() =>
                          onEdit(payable)
                        }
                        title="Editar conta"
                        aria-label={`Editar ${payable.description}`}
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        className="payables-action-button payables-action-danger"
                        onClick={() =>
                          onDelete(payable)
                        }
                        title="Excluir conta"
                        aria-label={`Excluir ${payable.description}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="payables-action-button payables-action-reverse"
                      onClick={() =>
                        onReverse(payable)
                      }
                      title="Estornar pagamento"
                      aria-label={`Estornar ${payable.description}`}
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default PayableTable;