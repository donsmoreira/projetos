import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  BarChart3,
  ChartPie,
  List,
  TrendingUp
} from "lucide-react";

import {
  getFinancialReport
} from "../../services/reportsService";

import { listManagementAccounts } from "../../services/managementAccountsService";

import type {
  FinancialReportData,
  ReportDetailFilters,
  ReportDimension,
  ReportFiltersData,
  ReportView
} from "../../types/report";

import type { ManagementAccount } from "../../types/managementAccount";

import {
  CHART_COLORS,
  OTHERS_COLOR,
  SERIES_COLORS
} from "../../constants/chartPalette";

import {
  DIMENSION_LABELS,
  EMPTY_DETAIL_FILTERS,
  applyDetailFilters,
  buildGroupedBars,
  buildPieSlices,
  buildTimeSeries,
  getGranularity,
  summarizeTransactions
} from "../../utils/reportCharts";

import type { PieKind } from "../../utils/reportCharts";

import ReportFilters from "./components/ReportFilters";
import ReportDetailFiltersBar from "./components/ReportDetailFiltersBar";
import ReportSummary from "./components/ReportSummary";
import TransactionsTable from "./components/TransactionsTable";
import {
  BarsReport,
  GroupedBarsReport,
  LinesReport,
  PieReport
} from "./components/ReportCharts";

import "./Reports.css";

const VIEWS = [
  { value: "descritivo" as const, label: "Descritivo", icon: List },
  { value: "barras" as const, label: "Torres", icon: BarChart3 },
  { value: "linhas" as const, label: "Curvas", icon: TrendingUp },
  { value: "pizza" as const, label: "Pizza", icon: ChartPie }
];

/** Formas de agrupar as torres (a primeira é a linha do tempo). */
const BAR_DIMENSIONS: ReportDimension[] = [
  "periodo",
  "conta_principal",
  "subconta",
  "contraparte",
  "lancamento",
  "conta",
  "origem"
];

/** Formas de dividir a pizza. */
const PIE_DIMENSIONS: ReportDimension[] = [
  "conta_principal",
  "subconta",
  "contraparte",
  "lancamento",
  "conta",
  "origem"
];

const PIE_KINDS: { value: PieKind; label: string }[] = [
  { value: "despesa", label: "Saídas (despesas)" },
  { value: "receita", label: "Entradas (receitas)" },
  { value: "geral", label: "Entradas x saídas (geral)" }
];

function toISODate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function getFirstDayOfMonth() {
  const today = new Date();
  return toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
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

const initialFilters: ReportFiltersData = {
  startDate: getFirstDayOfMonth(),
  endDate: toISODate(new Date()),
  transactionType: "todos"
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível gerar o relatório.";
}

function Reports() {
  const [filters, setFilters] =
    useState<ReportFiltersData>(initialFilters);

  // Filtros do relatório já gerado (os gráficos não mudam enquanto o filtro é editado)
  const [reportFilters, setReportFilters] =
    useState<ReportFiltersData>(initialFilters);

  const [report, setReport] =
    useState<FinancialReportData>(emptyReport);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [view, setView] =
    useState<ReportView>("descritivo");

  const [detailFilters, setDetailFilters] =
    useState<ReportDetailFilters>(EMPTY_DETAIL_FILTERS);

  const [barDimension, setBarDimension] =
    useState<ReportDimension>("periodo");

  const [pieKind, setPieKind] =
    useState<PieKind>("despesa");

  const [pieDimension, setPieDimension] =
    useState<ReportDimension>("conta_principal");

  const [managementAccounts, setManagementAccounts] =
    useState<ManagementAccount[]>([]);

  useEffect(() => {
    let active = true;

    Promise.all([
      getFinancialReport(initialFilters),
      listManagementAccounts().catch(() => [] as ManagementAccount[])
    ])
      .then(([data, accounts]) => {
        if (active) {
          setReport(data);
          setManagementAccounts(accounts);
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(getErrorMessage(error));
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
  }, []);

  async function loadReport(next?: ReportFiltersData) {
    const current = next ?? filters;

    if (!current.startDate || !current.endDate) {
      setErrorMessage("Informe o período do relatório.");
      return;
    }

    if (current.startDate > current.endDate) {
      setErrorMessage("A data inicial não pode ser maior que a data final.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const data = await getFinancialReport(current);

      setReport(data);
      setReportFilters(current);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  // Filtros extras valem para a tabela, o resumo e todos os gráficos
  const transactions = useMemo(
    () => applyDetailFilters(report.transactions, detailFilters, managementAccounts),
    [report.transactions, detailFilters, managementAccounts]
  );

  const summary = useMemo(
    () => summarizeTransactions(transactions),
    [transactions]
  );

  const showIncome = reportFilters.transactionType !== "saida";
  const showExpense = reportFilters.transactionType !== "entrada";

  const series = useMemo(
    () => buildTimeSeries(transactions, reportFilters.startDate, reportFilters.endDate),
    [transactions, reportFilters]
  );

  const groupedBars = useMemo(
    () => buildGroupedBars(transactions, barDimension, managementAccounts),
    [transactions, barDimension, managementAccounts]
  );

  const slices = useMemo(
    () => buildPieSlices(transactions, managementAccounts, pieKind, pieDimension),
    [transactions, managementAccounts, pieKind, pieDimension]
  );

  // Cores da pizza presas a cada item: calculadas sobre o período sem filtros,
  // para um filtro não trocar a cor das fatias que continuam na tela
  const baseSliceKeys = useMemo(
    () => buildPieSlices(report.transactions, managementAccounts, pieKind, pieDimension, 999)
      .map(slice => slice.key),
    [report.transactions, managementAccounts, pieKind, pieDimension]
  );

  const sliceColors = useMemo(() => {
    const colors = new Map<string, string>();

    if (pieKind === "geral") {
      colors.set("entrada", CHART_COLORS.entradas);
      colors.set("saida", CHART_COLORS.saidas);
      return colors;
    }

    baseSliceKeys
      .slice(0, SERIES_COLORS.length - 1)
      .forEach((key, index) => colors.set(key, SERIES_COLORS[index]));

    const used = new Set(colors.values());
    const free = SERIES_COLORS.filter(color => !used.has(color));

    for (const slice of slices) {
      if (slice.key === "outros") {
        colors.set("outros", OTHERS_COLOR);
      } else if (!colors.has(slice.key)) {
        colors.set(slice.key, free.shift() ?? OTHERS_COLOR);
      }
    }

    return colors;
  }, [baseSliceKeys, slices, pieKind]);

  const granularity = getGranularity(reportFilters.startDate, reportFilters.endDate);
  const unit = granularity === "dia" ? "dia" : "mês";

  const pieKindAvailable =
    pieKind === "geral" ||
    (pieKind === "receita" ? showIncome : showExpense);

  const hasCountedTransactions =
    transactions.some(transaction => !transaction.isTransfer);

  const filtered =
    Object.values(detailFilters).some(Boolean);

  const pieTitle =
    pieKind === "geral"
      ? "Entradas x saídas"
      : `${pieKind === "despesa" ? "Saídas" : "Entradas"} por ${DIMENSION_LABELS[pieDimension].toLowerCase()}`;

  const viewInfo: Record<ReportView, { title: string; subtitle: string }> = {
    descritivo: {
      title: "Movimentações do período",
      subtitle: "Entradas e saídas registradas nas contas bancárias e no caixa."
    },
    barras: {
      title: barDimension === "periodo"
        ? "Entradas x saídas"
        : `Entradas x saídas por ${DIMENSION_LABELS[barDimension].toLowerCase()}`,
      subtitle: barDimension === "periodo"
        ? `Total de cada ${unit} do período, lado a lado.`
        : "Maiores primeiro; acima de 12 grupos, o resto vira \"Outros\"."
    },
    linhas: {
      title: "Evolução no período",
      subtitle: `Entradas e saídas por ${unit}, e o resultado acumulado (tracejado).`
    },
    pizza: {
      title: pieTitle,
      subtitle: "Quanto cada parte representa do total do período."
    }
  };

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
            <ReportDetailFiltersBar
              filters={detailFilters}
              transactions={report.transactions}
              managementAccounts={managementAccounts}
              onChange={setDetailFilters}
            />

            {filtered && (
              <p className="report-filtered-note">
                Mostrando {transactions.length} de {report.transactions.length} movimentações do período, conforme os filtros.
              </p>
            )}

            <ReportSummary
              summary={summary}
            />

            <div
              className="report-view-tabs"
              role="tablist"
              aria-label="Tipo de relatório"
            >
              {VIEWS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={view === item.value}
                  className={view === item.value ? "is-active" : ""}
                  onClick={() => setView(item.value)}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              ))}
            </div>

            <section className="reports-transactions-section">
              <header className="reports-section-header report-view-header">
                <div>
                  <h3>{viewInfo[view].title}</h3>
                  <p>{viewInfo[view].subtitle}</p>
                </div>

                {view === "barras" && (
                  <div className="report-chart-controls">
                    <div className="report-filter-field">
                      <label htmlFor="report-bar-dimension">
                        Ver por
                      </label>

                      <select
                        id="report-bar-dimension"
                        value={barDimension}
                        onChange={event => setBarDimension(event.target.value as ReportDimension)}
                      >
                        {BAR_DIMENSIONS.map(dimension => (
                          <option key={dimension} value={dimension}>
                            {DIMENSION_LABELS[dimension]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {view === "pizza" && (
                  <div className="report-chart-controls">
                    <div className="report-filter-field">
                      <label htmlFor="report-pie-kind">
                        Mostrar
                      </label>

                      <select
                        id="report-pie-kind"
                        value={pieKind}
                        onChange={event => setPieKind(event.target.value as PieKind)}
                      >
                        {PIE_KINDS.map(kind => (
                          <option key={kind.value} value={kind.value}>
                            {kind.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {pieKind !== "geral" && (
                      <div className="report-filter-field">
                        <label htmlFor="report-pie-dimension">
                          Fatias por
                        </label>

                        <select
                          id="report-pie-dimension"
                          value={pieDimension}
                          onChange={event => setPieDimension(event.target.value as ReportDimension)}
                        >
                          {PIE_DIMENSIONS.map(dimension => (
                            <option key={dimension} value={dimension}>
                              {DIMENSION_LABELS[dimension]}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </header>

              {loading ? (
                <div className="reports-state">
                  Carregando relatório...
                </div>
              ) : view === "descritivo" ? (
                <TransactionsTable
                  transactions={transactions}
                />
              ) : !hasCountedTransactions ? (
                <div className="reports-empty">
                  <h3>Nenhuma entrada ou saída {filtered ? "com esses filtros" : "no período"}</h3>
                  <p>Altere o período{filtered ? ", limpe os filtros" : ""} ou o tipo de movimentação.</p>
                </div>
              ) : view === "barras" ? (
                barDimension === "periodo" ? (
                  <BarsReport
                    data={series}
                    showIncome={showIncome}
                    showExpense={showExpense}
                  />
                ) : (
                  <GroupedBarsReport
                    data={groupedBars}
                    showIncome={showIncome}
                    showExpense={showExpense}
                  />
                )
              ) : view === "linhas" ? (
                <LinesReport
                  data={series}
                  showIncome={showIncome}
                  showExpense={showExpense}
                />
              ) : !pieKindAvailable ? (
                <div className="reports-empty">
                  <h3>O tipo de movimentação escolhido não inclui {pieKind === "despesa" ? "saídas" : "entradas"}</h3>
                  <p>Mude o "Tipo de movimentação" para "Todas" e gere o relatório de novo.</p>
                </div>
              ) : slices.length === 0 ? (
                <div className="reports-empty">
                  <h3>Nada para mostrar na pizza</h3>
                  <p>Altere o período, os filtros ou o que a pizza mostra.</p>
                </div>
              ) : (
                <PieReport
                  slices={slices}
                  colorFor={key => sliceColors.get(key) ?? OTHERS_COLOR}
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
