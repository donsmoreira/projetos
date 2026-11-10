import {
  CircleDollarSign,
  Pencil,
  RotateCcw,
  Trash2
} from "lucide-react";

import type {
  Receivable
} from "../../../types/receivable";

type ReceivableTableProps = {
  receivables: Receivable[];
  onEdit: (receivable: Receivable) => void;
  onDelete: (receivable: Receivable) => void;
  onReceive: (receivable: Receivable) => void;
  onReverse: (receivable: Receivable) => void;
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

function getReceivableTotal(
  receivable: Receivable
) {
  return (
    Number(receivable.original_value || 0) +
    Number(receivable.interest || 0) +
    Number(receivable.penalty || 0)
  );
}

function ReceivableTable({
  receivables,
  onEdit,
  onDelete,
  onReceive,
  onReverse
}: ReceivableTableProps) {
  if (receivables.length === 0) {
    return (
      <div className="receivables-empty">
        <h3>Nenhuma conta encontrada</h3>

        <p>
          Cadastre uma conta ou altere os filtros da pesquisa.
        </p>
      </div>
    );
  }

  return (
    <div className="receivables-table-wrapper">
      <table className="receivables-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Vencimento</th>
            <th>Parcela</th>

            <th className="receivables-value-column">
              Total
            </th>

            <th>Status</th>

            <th className="receivables-actions-column">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          {receivables.map(receivable => {
            const isPending =
              receivable.status === "pendente";

            return (
              <tr key={receivable.id}>
                <td>
                  <strong>
                    {receivable.clients?.name ||
                      "Cliente não informado"}
                  </strong>
                </td>

                <td>
                  {receivable.description}
                </td>

                <td>
                  {receivable.category || "—"}
                </td>

                <td>
                  {formatDate(
                    receivable.due_date
                  )}
                </td>

                <td>
                  {receivable.installment_count > 1
                    ? `${receivable.installment_index}/${receivable.installment_count}`
                    : "Única"}
                </td>

                <td className="receivables-value">
                  {formatCurrency(
                    getReceivableTotal(
                      receivable
                    )
                  )}
                </td>

                <td>
                  <span
                    className={`receivables-status receivables-status-${receivable.status}`}
                  >
                    {isPending
                      ? "Pendente"
                      : "Recebido"}
                  </span>
                </td>

                <td className="receivables-actions">
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        className="receivables-action-button receivables-action-receive"
                        onClick={() =>
                          onReceive(receivable)
                        }
                        title="Registrar recebimento"
                        aria-label={`Receber ${receivable.description}`}
                      >
                        <CircleDollarSign
                          size={16}
                        />
                      </button>

                      <button
                        type="button"
                        className="receivables-action-button"
                        onClick={() =>
                          onEdit(receivable)
                        }
                        title="Editar conta"
                        aria-label={`Editar ${receivable.description}`}
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        className="receivables-action-button receivables-action-danger"
                        onClick={() =>
                          onDelete(receivable)
                        }
                        title="Excluir conta"
                        aria-label={`Excluir ${receivable.description}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="receivables-action-button receivables-action-reverse"
                      onClick={() =>
                        onReverse(receivable)
                      }
                      title="Estornar recebimento"
                      aria-label={`Estornar ${receivable.description}`}
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

export default ReceivableTable;