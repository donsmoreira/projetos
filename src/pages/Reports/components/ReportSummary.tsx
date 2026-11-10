import type {
  ReportSummaryData
} from "../../../types/report";

type ReportSummaryProps = {
  summary: ReportSummaryData;
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

function ReportSummary({
  summary
}: ReportSummaryProps) {
  return (
    <section className="report-summary-grid">
      <article className="report-summary-card report-summary-income">
        <span>Total de entradas</span>

        <strong>
          {formatCurrency(
            summary.totalIncome
          )}
        </strong>
      </article>

      <article className="report-summary-card report-summary-expense">
        <span>Total de saídas</span>

        <strong>
          {formatCurrency(
            summary.totalExpense
          )}
        </strong>
      </article>

      <article
        className={`report-summary-card ${
          summary.balance >= 0
            ? "report-summary-balance-positive"
            : "report-summary-balance-negative"
        }`}
      >
        <span>Saldo do período</span>

        <strong>
          {formatCurrency(
            summary.balance
          )}
        </strong>
      </article>

      <article className="report-summary-card">
        <span>Movimentações</span>

        <strong>
          {summary.transactionCount}
        </strong>
      </article>
    </section>
  );
}

export default ReportSummary;