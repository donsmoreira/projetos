import type {
  ReceivableItem
} from "../dashboardTypes";

import {
  formatCurrency,
  formatDate
} from "../dashboardUtils";

type UpcomingReceivablesProps = {
  items: ReceivableItem[];
};

function UpcomingReceivables({
  items
}: UpcomingReceivablesProps) {
  return (
    <article className="dashboard-panel">
      <header className="dashboard-panel-header">
        <h3>Próximos recebimentos</h3>
        <span>A receber</span>
      </header>

      <div className="dashboard-table-wrapper">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Cliente</th>
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
                  Nenhum recebimento pendente.
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id}>
                  <td>{item.client}</td>
                  <td>{item.description}</td>

                  <td>
                    {formatDate(item.dueDate)}
                  </td>

                  <td className="table-value receivable-value">
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

export default UpcomingReceivables;