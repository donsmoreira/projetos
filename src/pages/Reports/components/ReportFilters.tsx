import type {
  ReportFiltersData
} from "../../../types/report";

import { getPeriodPreset } from "../../../utils/reportCharts";

type PresetKey = Parameters<typeof getPeriodPreset>[0];

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "mes", label: "Este mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "30dias", label: "Últimos 30 dias" },
  { value: "90dias", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
  { value: "ano_passado", label: "Ano passado" }
];

type ReportFiltersProps = {
  filters: ReportFiltersData;
  loading: boolean;
  onChange: (
    filters: ReportFiltersData
  ) => void;
  /** Gera o relatório; com "next", usa esses filtros (atalhos de período) */
  onSubmit: (next?: ReportFiltersData) => void;
};

function getToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function ReportFilters({
  filters,
  loading,
  onChange,
  onSubmit
}: ReportFiltersProps) {
  function updateField<
    K extends keyof ReportFiltersData
  >(
    field: K,
    value: ReportFiltersData[K]
  ) {
    onChange({
      ...filters,
      [field]: value
    });
  }

  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    onSubmit();
  }

  function applyPreset(preset: PresetKey) {
    const next = {
      ...filters,
      ...getPeriodPreset(preset, getToday())
    };

    onChange(next);
    onSubmit(next);
  }

  const today = getToday();

  return (
    <div className="report-filters-wrapper">
      <div
        className="report-period-presets"
        role="group"
        aria-label="Atalhos de período"
      >
        {PRESETS.map(preset => {
          const range = getPeriodPreset(preset.value, today);
          const active =
            range.startDate === filters.startDate &&
            range.endDate === filters.endDate;

          return (
            <button
              key={preset.value}
              type="button"
              className={active ? "is-active" : ""}
              onClick={() => applyPreset(preset.value)}
              disabled={loading}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <form
        className="report-filters"
        onSubmit={handleSubmit}
      >
        <div className="report-filter-field">
          <label htmlFor="report-start-date">
            Data inicial
          </label>

          <input
            id="report-start-date"
            type="date"
            value={filters.startDate}
            onChange={event =>
              updateField(
                "startDate",
                event.target.value
              )
            }
            required
          />
        </div>

        <div className="report-filter-field">
          <label htmlFor="report-end-date">
            Data final
          </label>

          <input
            id="report-end-date"
            type="date"
            value={filters.endDate}
            onChange={event =>
              updateField(
                "endDate",
                event.target.value
              )
            }
            required
          />
        </div>

        <div className="report-filter-field">
          <label htmlFor="report-type">
            Tipo de movimentação
          </label>

          <select
            id="report-type"
            value={filters.transactionType}
            onChange={event =>
              updateField(
                "transactionType",
                event.target.value as
                  | "todos"
                  | "entrada"
                  | "saida"
              )
            }
          >
            <option value="todos">
              Todas (entradas e saídas)
            </option>

            <option value="entrada">
              Só entradas
            </option>

            <option value="saida">
              Só saídas
            </option>
          </select>
        </div>

        <button
          type="submit"
          className="report-filter-button"
          disabled={loading}
        >
          {loading
            ? "Carregando..."
            : "Gerar relatório"}
        </button>
      </form>
    </div>
  );
}

export default ReportFilters;
