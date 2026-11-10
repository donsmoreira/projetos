import type {
  ReportFiltersData
} from "../../../types/report";

type ReportFiltersProps = {
  filters: ReportFiltersData;
  loading: boolean;
  onChange: (
    filters: ReportFiltersData
  ) => void;
  onSubmit: () => void;
};

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

  return (
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
            Todas
          </option>

          <option value="entrada">
            Entradas
          </option>

          <option value="saida">
            Saídas
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
  );
}

export default ReportFilters;