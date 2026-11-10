import type { FinancialSummary } from "../dashboardTypes";

import { formatCurrency } from "../dashboardUtils";

type QuickSummaryProps = {
  items: FinancialSummary[];
};

function QuickSummary({
  items
}: QuickSummaryProps) {
  return (
    <section className="dashboard-section-heading">
      <div className="dashboard-heading">
        <div>
          <h2>Painel</h2>

          <p className="dashboard-heading-subtitle">
            Visão geral da sua situação financeira.
          </p>
        </div>

        <div className="dashboard-quick-summary">
          {items.map(item => (
            <article
              key={item.label}
              className="quick-summary-card"
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
      </div>
    </section>
  );
}

export default QuickSummary;