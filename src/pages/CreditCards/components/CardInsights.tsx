import { useMemo } from "react";

import { formatCurrency } from "../../../utils/currency";
import { invoiceLabel } from "../../../utils/cardInvoices";
import type { CardInvoice, CardPurchaseRow } from "../../../utils/cardInvoices";

type CardInsightsProps = {
  purchases: CardPurchaseRow[];
  /** Fatura que está sendo vista no extrato */
  invoice: CardInvoice;
};

type Installment = {
  id: string;
  description: string;
  total: number;
  count: number;
  paidCount: number;
  remaining: number;
  lastMonth: string;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Gráfico de gastos da fatura por conta gerencial + parcelamentos que ainda têm parcelas a pagar. */
function CardInsights({ purchases, invoice }: CardInsightsProps) {
  // Gastos da fatura vista, agrupados por conta gerencial
  const byAccount = useMemo(() => {
    const totals = new Map<string, number>();

    for (const item of invoice.items) {
      const key = item.management_account_name || "Sem conta gerencial";
      totals.set(key, round((totals.get(key) ?? 0) + Number(item.value || 0)));
    }

    return [...totals.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [invoice.items]);

  const maxAccount = Math.max(...byAccount.map(item => item.value), 1);

  // Compras parceladas que ainda têm parcela em aberto
  const installments = useMemo(() => {
    const groups = new Map<string, CardPurchaseRow[]>();

    for (const item of purchases) {
      if (item.installment_count > 1 && item.installment_group_id) {
        const list = groups.get(item.installment_group_id) ?? [];
        list.push(item);
        groups.set(item.installment_group_id, list);
      }
    }

    const result: Installment[] = [];

    for (const [id, items] of groups) {
      const open = items.filter(item => !item.settled);

      if (open.length === 0) {
        continue;
      }

      const first = items[0];
      const months = items.map(item => item.invoice_month ?? "").filter(Boolean).sort();

      result.push({
        id,
        description: first.description,
        total: Number(first.purchase_total ?? items.reduce((sum, item) => sum + Number(item.value || 0), 0)),
        count: first.installment_count,
        paidCount: items.length - open.length,
        remaining: round(open.reduce((sum, item) => sum + Number(item.value || 0), 0)),
        lastMonth: months[months.length - 1] ?? ""
      });
    }

    return result.sort((a, b) => b.remaining - a.remaining);
  }, [purchases]);

  const totalRemaining = round(installments.reduce((sum, item) => sum + item.remaining, 0));

  return (
    <div className="card-insights">
      <div className="card-insights-block">
        <h4>Onde foi gasto · {invoiceLabel(invoice.month, true)}</h4>

        {byAccount.length === 0 ? (
          <p className="invoice-forecast-empty">Nenhuma compra nesta fatura.</p>
        ) : (
          <ul className="card-insights-bars">
            {byAccount.map(item => (
              <li key={item.name}>
                <span className="card-insights-name" title={item.name}>{item.name}</span>
                <span className="invoice-forecast-bar">
                  <i style={{ width: `${Math.max((item.value / maxAccount) * 100, 3)}%` }} />
                </span>
                <strong>{formatCurrency(item.value)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-insights-block">
        <h4>
          Parcelamentos em andamento
          {installments.length > 0 && <small> · falta pagar {formatCurrency(totalRemaining)}</small>}
        </h4>

        {installments.length === 0 ? (
          <p className="invoice-forecast-empty">Nenhuma compra parcelada em aberto.</p>
        ) : (
          <ul className="card-installments">
            {installments.map(item => (
              <li key={item.id}>
                <div className="card-installments-top">
                  <strong>{item.description}</strong>
                  <span>{formatCurrency(item.remaining)} a pagar</span>
                </div>
                <span
                  className="card-installments-track"
                  role="img"
                  aria-label={`${item.paidCount} de ${item.count} parcelas pagas`}
                >
                  <i style={{ width: `${(item.paidCount / item.count) * 100}%` }} />
                </span>
                <small>
                  {item.paidCount}/{item.count} pagas · total {formatCurrency(item.total)}
                  {item.lastMonth ? ` · última em ${invoiceLabel(item.lastMonth, true)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default CardInsights;
