import { formatCurrency } from "../../../utils/currency";
import { formatDay, invoiceLabel } from "../../../utils/cardInvoices";
import type { CardInvoice } from "../../../utils/cardInvoices";

import type { CreditCard } from "../../../types/creditCard";

type CardOverviewProps = {
  card: CreditCard;
  /** Fatura atual (a que está recebendo as compras de hoje) */
  invoice: CardInvoice | undefined;
};

/** Resumo do cartão: valor da fatura atual, vencimento e barra do limite. */
function CardOverview({ card, invoice }: CardOverviewProps) {
  const limit = Number(card.limit_total || 0);
  const used = Number(card.used_limit || 0);
  const available = Number(card.available_limit || 0);

  const usedPercent = limit > 0 ? Math.min(Math.max((used / limit) * 100, 0), 100) : 0;
  const overLimit = limit > 0 && used > limit;

  return (
    <div className="card-overview">
      <div className="card-overview-row">
        <div>
          <span>Valor da fatura{invoice ? ` · ${invoiceLabel(invoice.month, true)}` : ""}</span>
          <strong className="card-overview-big">{formatCurrency(invoice?.total ?? 0)}</strong>
        </div>

        <div className="is-right">
          <span>Vencimento</span>
          <strong className="card-overview-big">{invoice ? formatDay(invoice.dueDate).slice(0, 5) : "—"}</strong>
        </div>
      </div>

      {limit > 0 ? (
        <div
          className="card-limit-bar"
          role="img"
          aria-label={`Limite utilizado ${Math.round(usedPercent)}% de ${formatCurrency(limit)}`}
          title={`${Math.round(usedPercent)}% do limite utilizado`}
        >
          {usedPercent > 0 && <i className="is-used" style={{ flexBasis: `${usedPercent}%` }} />}
          {usedPercent < 100 && <i className="is-free" />}
        </div>
      ) : (
        <p className="card-overview-note">Cadastre o limite do cartão para ver o gráfico.</p>
      )}

      <div className="card-overview-row">
        <div>
          <strong className={overLimit ? "is-expense" : ""}>
            <i className="card-overview-dot is-used" aria-hidden="true" />
            {formatCurrency(used)}
          </strong>
          <span>Limite utilizado</span>
        </div>

        <div className="is-right">
          <strong>
            <i className="card-overview-dot is-free" aria-hidden="true" />
            {formatCurrency(available)}
          </strong>
          <span>Limite disponível</span>
        </div>
      </div>

      {limit > 0 && (
        <p className="card-overview-note">
          Limite total {formatCurrency(limit)} · {Math.round(usedPercent)}% utilizado
          {overLimit ? " · acima do limite" : ""}
        </p>
      )}
    </div>
  );
}

export default CardOverview;
