import type { FinancialSummary } from "../dashboardTypes";

import { formatCurrency } from "../dashboardUtils";

type SummaryCardsProps = {
  items: FinancialSummary[];
};

function SummaryCards({
  items
}: SummaryCardsProps) {
  return (
    <section className="dashboard-section">
      <header className="dashboard-section-title">
        <div>
          <h3>Resumo financeiro</h3>

          <p>
            Visão consolidada da situação atual.
          </p>
        </div>
      </header>

      <div className="dashboard-summary-grid">
        {items.map(item => (
          <article
            key={item.label}
            className="dashboard-summary-card"
          >
            <span>{item.label}</span>

            <strong
              className={`value-${item.variant}`}
            >
              {formatCurrency(item.value)}
            </strong>
          </article>
        ))}
      </div>
    </section>
  );
}

export default SummaryCards;