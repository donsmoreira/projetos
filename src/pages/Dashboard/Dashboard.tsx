import {
  useEffect,
  useState
} from "react";

import {
  getDashboardData
} from "../../services/dashboardService";

import type {
  DashboardData
} from "./dashboardTypes";

import QuickSummary from "./components/QuickSummary";
import SummaryCards from "./components/SummaryCards";
import UpcomingPayables from "./components/UpcomingPayables";
import UpcomingReceivables from "./components/UpcomingReceivables";
import BankAccounts from "./components/BankAccounts";
import WeekBoard from "./components/WeekBoard";

import "./Dashboard.css";

function Dashboard() {
  const [dashboardData, setDashboardData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMessage("");

        const data =
          await getDashboardData();

        setDashboardData(data);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o Dashboard.";

        setErrorMessage(message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="dashboard">
        <section className="dashboard-state">
          Carregando informações financeiras...
        </section>
      </div>
    );
  }

  if (errorMessage || !dashboardData) {
    return (
      <div className="dashboard">
        <section className="dashboard-state dashboard-state-error">
          <h2>Não foi possível carregar o painel</h2>
          <p>{errorMessage}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <QuickSummary
        items={dashboardData.summary}
      />

      <SummaryCards
        items={dashboardData.summary}
      />

      <WeekBoard />

      <section className="dashboard-section">
        <header className="dashboard-section-title">
          <div>
            <h3>Movimentações próximas</h3>

            <p>
              Contas previstas para os próximos vencimentos.
            </p>
          </div>
        </header>

        <div className="dashboard-table-grid">
          <UpcomingPayables
            items={
              dashboardData.upcomingPayables
            }
          />

          <UpcomingReceivables
            items={
              dashboardData.upcomingReceivables
            }
          />
        </div>
      </section>

      <BankAccounts
        accounts={dashboardData.bankAccounts}
      />
    </div>
  );
}

export default Dashboard;