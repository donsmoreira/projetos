import {
  useEffect,
  useState
} from "react";

import {
  getFinancialReport
} from "../../services/reportsService";

import type {
  FinancialReportData,
  ReportFiltersData
} from "../../types/report";

import ReportFilters from "./components/ReportFilters";
import ReportSummary from "./components/ReportSummary";
import TransactionsTable from "./components/TransactionsTable";

import "./Reports.css";

function getFirstDayOfMonth() {
  const today = new Date();

  return new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  )
    .toISOString()
    .split("T")[0];
}

function getToday() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

const emptyReport: FinancialReportData = {
  summary: {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    transactionCount: 0
  },

  transactions: []
};

function Reports() {
  const [filters, setFilters] =
    useState<ReportFiltersData>({
      startDate:
        getFirstDayOfMonth(),

      endDate:
        getToday(),

      transactionType:
        "todos"
    });

  const [report, setReport] =
    useState<FinancialReportData>(
      emptyReport
    );

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function loadReport() {
    if (
      !filters.startDate ||
      !filters.endDate
    ) {
      setErrorMessage(
        "Informe o período do relatório."
      );
      return;
    }

    if (
      filters.startDate >
      filters.endDate
    ) {
      setErrorMessage(
        "A data inicial não pode ser maior que a data final."
      );
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const data =
        await getFinancialReport(
          filters
        );

      setReport(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o relatório.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, []);

  return (
    <div className="reports-page">
      <section className="reports-header">
        <div>
          <h2>Relatórios</h2>

          <p>
            Consulte entradas, saídas e movimentações financeiras.
          </p>
        </div>
      </section>

      <section className="reports-content">
        <ReportFilters
          filters={filters}
          loading={loading}
          onChange={setFilters}
          onSubmit={loadReport}
        />

        {errorMessage && (
          <div className="reports-state reports-state-error">
            {errorMessage}
          </div>
        )}

        {!errorMessage && (
          <>
            <ReportSummary
              summary={report.summary}
            />

            <section className="reports-transactions-section">
              <header className="reports-section-header">
                <div>
                  <h3>
                    Movimentações do período
                  </h3>

                  <p>
                    Entradas e saídas registradas nas contas bancárias.
                  </p>
                </div>
              </header>

              {loading ? (
                <div className="reports-state">
                  Carregando relatório...
                </div>
              ) : (
                <TransactionsTable
                  transactions={
                    report.transactions
                  }
                />
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}

export default Reports;