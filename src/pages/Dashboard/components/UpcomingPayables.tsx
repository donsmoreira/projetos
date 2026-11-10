import type {
  PayableItem
} from "../dashboardTypes";

import {
  formatCurrency,
  formatDate
} from "../dashboardUtils";

type UpcomingPayablesProps = {
  items: PayableItem[];
};

function UpcomingPayables({
  items
}: UpcomingPayablesProps) {
  return (
    <article className="dashboard-panel">
      <header className="dashboard-panel-header">
        <h3>Próximos vencimentos</h3>
        <span>A pagar</span>
      </header>

      <div className="dashboard-table-wrapper">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Descrição</th>
              <th>Vencimento</th>

              <th className="table-value">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="dashboard-table-message"
                >
                  Nenhuma conta pendente.
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id}>
                  <td>{item.supplier}</td>
                  <td>{item.description}</td>

                  <td>
                    {formatDate(item.dueDate)}
                  </td>

                  <td className="table-value payable-value">
                    {formatCurrency(item.value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default UpcomingPayables;