import { useCallback, useEffect, useMemo, useState } from "react";

import { ChevronLeft, ChevronRight, CreditCard as CardIcon, Plus, RotateCcw, Trash2, Wallet } from "lucide-react";

import Modal from "../../../components/Modal/Modal";
import {
  deleteCardPurchase,
  listCardPurchases,
  listCardSettlements,
  reverseCardPayment
} from "../../../services/cardInvoicesService";
import { formatCurrency } from "../../../utils/currency";
import {
  INVOICE_STATUS_LABELS,
  addMonths,
  buildInvoices,
  formatDay,
  invoiceLabel
} from "../../../utils/cardInvoices";
import type { CardPurchaseRow, CardSettlementRow } from "../../../utils/cardInvoices";

import type { CreditCard } from "../../../types/creditCard";

import CardPurchaseForm from "./CardPurchaseForm";
import PayInvoiceForm from "./PayInvoiceForm";
import CardOverview from "./CardOverview";
import CardInsights from "./CardInsights";

type CardInvoicesProps = {
  card: CreditCard;
  canCreate: boolean;
  canDelete: boolean;
  canSettle: boolean;
  /** Recarrega a lista de cartões (limite usado) */
  onChanged: () => Promise<void> | void;
};

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

type ModalState = "purchase" | "pay" | null;

/** Faturas do cartão: histórico de cada mês, pagamento e previsão das próximas. */
function CardInvoices({ card, canCreate, canDelete, canSettle, onChanged }: CardInvoicesProps) {
  const [purchases, setPurchases] = useState<CardPurchaseRow[]>([]);
  const [settlements, setSettlements] = useState<CardSettlementRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [modal, setModal] = useState<ModalState>(null);

  const closingDay = card.closing_day ?? 0;
  const dueDay = card.due_day ?? 0;
  const hasDays = closingDay > 0 && dueDay > 0;

  const load = useCallback(async () => {
    const [purchaseRows, settlementRows] = await Promise.all([
      listCardPurchases(card.id),
      listCardSettlements(card.id)
    ]);
    setPurchases(purchaseRows);
    setSettlements(settlementRows);
  }, [card.id]);

  useEffect(() => {
    let active = true;

    Promise.all([listCardPurchases(card.id), listCardSettlements(card.id)])
      .then(([purchaseRows, settlementRows]) => {
        if (active) {
          setPurchases(purchaseRows);
          setSettlements(settlementRows);
          setErrorMessage("");
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar as faturas.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [card.id]);

  const { invoices, currentMonth } = useMemo(
    () => hasDays
      ? buildInvoices(closingDay, dueDay, purchases, settlements, today())
      : { invoices: [], currentMonth: "" },
    [hasDays, closingDay, dueDay, purchases, settlements]
  );

  const month = selectedMonth && invoices.some(item => item.month === selectedMonth) ? selectedMonth : currentMonth;
  const index = invoices.findIndex(item => item.month === month);
  const invoice = invoices[index];
  const currentInvoice = invoices.find(item => item.month === currentMonth);

  // Atual e anteriores: "Pagar" · mês seguinte: "Antecipar" · mais à frente: bloqueada
  const nextMonth = currentMonth ? addMonths(currentMonth, 1) : "";
  const payMode = !invoice || invoice.month <= currentMonth
    ? "pagar"
    : invoice.month === nextMonth ? "antecipar" : "bloqueada";

  // Previsão: faturas depois da atual, até a última que tem parcela
  const forecast = invoices.filter(item => item.month > currentMonth && item.total > 0);
  const maxForecast = Math.max(...forecast.map(item => item.total), 1);

  // Compras com alguma parcela em fatura paga não podem ser excluídas
  const groupsWithPaid = useMemo(
    () => new Set(purchases.filter(item => item.settled).map(item => item.installment_group_id)),
    [purchases]
  );

  async function refresh() {
    await load();
    await onChanged();
  }

  async function handleDelete(item: CardPurchaseRow) {
    if (!item.installment_group_id) {
      return;
    }

    const whole = item.installment_count > 1
      ? `a compra "${item.description}" inteira (as ${item.installment_count} parcelas, ${formatCurrency(item.purchase_total ?? item.value)})`
      : `a compra "${item.description}" (${formatCurrency(item.value)})`;

    if (!window.confirm(`Excluir ${whole}?`)) {
      return;
    }

    try {
      await deleteCardPurchase(item.installment_group_id);
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir a compra.");
    }
  }

  async function handleReverse(settlement: CardSettlementRow) {
    if (!window.confirm(
      `Estornar o pagamento de ${formatCurrency(settlement.value)} feito em ${formatDay(settlement.settlement_date)}? A saída da conta/caixa é desfeita e a fatura volta a ficar em aberto.`
    )) {
      return;
    }

    try {
      await reverseCardPayment(settlement.id);
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível estornar.");
    }
  }

  if (!hasDays) {
    return (
      <section className="card-invoices">
        <div className="credit-cards-state">
          Informe o dia de fechamento e o de vencimento no cadastro do cartão "{card.name}" para usar as faturas.
        </div>
      </section>
    );
  }

  return (
    <section className="card-invoices">
      <header className="card-invoices-header">
        <div className="card-invoices-title">
          <CardIcon size={20} />
          <div>
            <h3>{card.name}</h3>
            <p>Fecha dia {closingDay} · vence dia {dueDay}</p>
          </div>
        </div>

        {canCreate && (
          <button type="button" className="credit-cards-new-button" onClick={() => setModal("purchase")}>
            <Plus size={16} /> Lançar compra
          </button>
        )}
      </header>

      {!loading && <CardOverview card={card} invoice={currentInvoice} />}

      {errorMessage && <div className="credit-cards-state credit-cards-state-error">{errorMessage}</div>}

      {loading ? (
        <div className="credit-cards-state">Carregando faturas...</div>
      ) : invoice && (
        <>
          <div className="invoice-nav">
            <button
              type="button"
              className="invoice-arrow"
              disabled={index <= 0}
              onClick={() => setSelectedMonth(invoices[index - 1].month)}
              aria-label="Fatura anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="invoice-nav-title">
              <strong>Fatura de {invoiceLabel(invoice.month)}</strong>
              <span className={`invoice-status is-${invoice.status}`}>
                {invoice.month === currentMonth ? "Atual · " : ""}{INVOICE_STATUS_LABELS[invoice.status]}
              </span>
            </div>

            <button
              type="button"
              className="invoice-arrow"
              disabled={index >= invoices.length - 1}
              onClick={() => setSelectedMonth(invoices[index + 1].month)}
              aria-label="Próxima fatura"
            >
              <ChevronRight size={18} />
            </button>

            {invoice.month !== currentMonth && (
              <button type="button" className="invoice-today" onClick={() => setSelectedMonth(currentMonth)}>
                Fatura atual
              </button>
            )}
          </div>

          <div className="invoice-summary">
            <div><span>Fecha em</span><strong>{formatDay(invoice.closingDate)}</strong></div>
            <div><span>Vence em</span><strong>{formatDay(invoice.dueDate)}</strong></div>
            <div><span>Total</span><strong>{formatCurrency(invoice.total)}</strong></div>
            <div>
              <span>{invoice.open > 0 ? "Em aberto" : "Pago"}</span>
              <strong className={invoice.open > 0 ? "is-expense" : "is-income"}>
                {formatCurrency(invoice.open > 0 ? invoice.open : invoice.paid)}
              </strong>
            </div>

            {canSettle && invoice.open > 0 && payMode !== "bloqueada" && (
              <button type="button" className="invoice-pay" onClick={() => setModal("pay")}>
                <Wallet size={15} /> {payMode === "antecipar" ? "Antecipar fatura" : "Pagar fatura"}
              </button>
            )}

            {canSettle && invoice.open > 0 && payMode === "bloqueada" && (
              <span className="invoice-pay-locked">
                Só dá para antecipar a fatura de {invoiceLabel(nextMonth)}.
              </span>
            )}
          </div>

          {invoice.settlements.length > 0 && (
            <div className="invoice-payments">
              {invoice.settlements.map(settlement => (
                <div key={settlement.id} className="invoice-payment">
                  <span>
                    Pago {formatCurrency(settlement.value)} em {formatDay(settlement.settlement_date)}
                    {settlement.notes ? ` · ${settlement.notes}` : ""}
                  </span>
                  {canSettle && (
                    <button type="button" className="invoice-reverse" onClick={() => void handleReverse(settlement)}>
                      <RotateCcw size={13} /> Estornar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {invoice.items.length === 0 ? (
            <div className="credit-cards-state">Nenhuma compra nesta fatura.</div>
          ) : (
            <div className="invoice-table-wrapper">
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Parcela</th>
                    <th className="is-number">Valor</th>
                    <th className="is-number">Total da compra</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map(item => {
                    const locked = groupsWithPaid.has(item.installment_group_id);

                    return (
                      <tr key={item.id} className={item.settled ? "is-paid" : ""}>
                        <td>{formatDay(item.transaction_date)}</td>
                        <td>
                          {item.description}
                          {item.management_account_name && <small>{item.management_account_name}</small>}
                        </td>
                        <td>
                          <span className="invoice-installment">
                            {item.installment_count === 1 ? "À vista" : `${item.installment_index}/${item.installment_count}`}
                          </span>
                        </td>
                        <td className="is-number"><strong>{formatCurrency(item.value)}</strong></td>
                        <td className="is-number">{formatCurrency(item.purchase_total ?? item.value)}</td>
                        <td className="invoice-actions">
                          {canDelete && !locked && (
                            <button
                              type="button"
                              className="invoice-delete"
                              onClick={() => void handleDelete(item)}
                              title={item.installment_count > 1 ? "Excluir a compra (todas as parcelas)" : "Excluir a compra"}
                              aria-label="Excluir compra"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <CardInsights purchases={purchases} invoice={invoice} />

          <div className="invoice-forecast">
            <h4>Próximas faturas</h4>

            {forecast.length === 0 ? (
              <p className="invoice-forecast-empty">Nenhuma parcela lançada para os próximos meses.</p>
            ) : (
              <ul>
                {forecast.map(item => (
                  <li key={item.month}>
                    <button
                      type="button"
                      className={item.month === month ? "is-selected" : ""}
                      onClick={() => setSelectedMonth(item.month)}
                    >
                      <span className="invoice-forecast-month">{invoiceLabel(item.month, true)}</span>
                      <span className="invoice-forecast-bar">
                        <i style={{ width: `${Math.max((item.total / maxForecast) * 100, 3)}%` }} />
                      </span>
                      <strong>{formatCurrency(item.total)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {modal === "purchase" && (
        <Modal title="Lançar compra" subtitle={card.name} onClose={() => setModal(null)}>
          <CardPurchaseForm
            card={card}
            onCancel={() => setModal(null)}
            onSaved={async () => {
              setModal(null);
              await refresh();
            }}
          />
        </Modal>
      )}

      {modal === "pay" && invoice && (
        <Modal title={payMode === "antecipar" ? "Antecipar fatura" : "Pagar fatura"} subtitle={card.name} onClose={() => setModal(null)}>
          <PayInvoiceForm
            card={card}
            invoice={invoice}
            onCancel={() => setModal(null)}
            onSaved={async () => {
              setModal(null);
              await refresh();
            }}
          />
        </Modal>
      )}
    </section>
  );
}

export default CardInvoices;
