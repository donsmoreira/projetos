import type {
  BankAccountItem
} from "../dashboardTypes";

import {
  formatCurrency
} from "../dashboardUtils";

type BankAccountsProps = {
  accounts: BankAccountItem[];
};

function BankAccounts({
  accounts
}: BankAccountsProps) {
  return (
    <section className="dashboard-section">
      <header className="dashboard-section-title">
        <div>
          <h3>Posição bancária</h3>

          <p>
            Saldos atuais das contas cadastradas.
          </p>
        </div>
      </header>

      <article className="dashboard-panel">
        <header className="dashboard-panel-header">
          <h3>Contas bancárias</h3>
          <span>Saldo atual</span>
        </header>

        <div className="dashboard-table-wrapper">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Banco</th>

                <th className="table-value">
                  Saldo
                </th>
              </tr>
            </thead>

            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="dashboard-table-message"
                  >
                    Nenhuma conta bancária cadastrada.
                  </td>
                </tr>
              ) : (
                accounts.map(account => (
                  <tr key={account.id}>
                    <td>{account.account}</td>
                    <td>{account.bank}</td>

                    <td className="table-value bank-balance">
                      {formatCurrency(
                        account.balance
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default BankAccounts;