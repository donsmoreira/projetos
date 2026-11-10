import {
  Pencil,
  Trash2
} from "lucide-react";

import type {
  CreditCard
} from "../../../types/creditCard";

import { formatAccountBank } from "../../../utils/bank";

type CreditCardTableProps = {
  cards: CreditCard[];
  onEdit: (card: CreditCard) => void;
  onDelete: (card: CreditCard) => void;
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

function CreditCardTable({
  cards,
  onEdit,
  onDelete
}: CreditCardTableProps) {
  if (cards.length === 0) {
    return (
      <div className="credit-cards-empty">
        <h3>Nenhum cartão encontrado</h3>

        <p>
          Cadastre um cartão ou altere os termos da pesquisa.
        </p>
      </div>
    );
  }

  return (
    <div className="credit-cards-table-wrapper">
      <table className="credit-cards-table">
        <thead>
          <tr>
            <th>Cartão</th>
            <th>Banco</th>
            <th>Bandeira</th>
            <th>Final</th>
            <th>Fechamento</th>
            <th>Vencimento</th>

            <th className="credit-cards-value-column">
              Limite total
            </th>

            <th className="credit-cards-value-column">
              Disponível
            </th>

            <th className="credit-cards-value-column">
              Utilizado
            </th>

            <th className="credit-cards-actions-column">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          {cards.map(card => (
            <tr key={card.id}>
              <td>
                <div className="credit-card-name-cell">
                  <span
                    className="credit-card-color"
                    style={{
                      background:
                        card.color || "#1a7cff"
                    }}
                  />

                  <div>
                    <strong>{card.name}</strong>

                    <small>
                      {displayValue(
                        card.holder_name
                      )}
                    </small>
                  </div>
                </div>
              </td>

              <td>
                {formatAccountBank(
                  card.bank_accounts
                ) || "—"}
              </td>

              <td>
                {displayValue(card.brand)}
              </td>

              <td>
                {card.final_digits
                  ? `•••• ${card.final_digits}`
                  : "—"}
              </td>

              <td>
                {card.closing_day
                  ? `Dia ${card.closing_day}`
                  : "—"}
              </td>

              <td>
                {card.due_day
                  ? `Dia ${card.due_day}`
                  : "—"}
              </td>

              <td className="credit-cards-value">
                {formatCurrency(
                  card.limit_total
                )}
              </td>

              <td className="credit-cards-value credit-cards-available">
                {formatCurrency(
                  card.available_limit
                )}
              </td>

              <td className="credit-cards-value credit-cards-used">
                {formatCurrency(
                  card.used_limit
                )}
              </td>

              <td className="credit-cards-actions">
                <button
                  type="button"
                  className="credit-cards-action-button"
                  onClick={() => onEdit(card)}
                  title={`Editar ${card.name}`}
                  aria-label={`Editar ${card.name}`}
                >
                  <Pencil size={16} />
                </button>

                <button
                  type="button"
                  className="credit-cards-action-button credit-cards-action-danger"
                  onClick={() => onDelete(card)}
                  title={`Excluir ${card.name}`}
                  aria-label={`Excluir ${card.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CreditCardTable;