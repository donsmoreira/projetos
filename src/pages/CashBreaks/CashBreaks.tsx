import { useEffect, useMemo, useState } from "react";

import { AlertTriangle } from "lucide-react";

import { useCompany } from "../../hooks/useCompany";
import { listAccountsWithBalance } from "../../services/bankAccountsService";
import { listCashBreaks } from "../../services/cashSessionService";
import { listCompanyMembers } from "../../services/companyService";
import { formatCurrency } from "../../utils/currency";

import type { AccountWithBalance } from "../../types/bankAccount";
import type { CashBreak } from "../../types/cashSession";

import "./CashBreaks.css";

function toISODate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split("T")[0];
}

function monthStart() {
  const today = new Date();
  return toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Relatórios → Quebra de caixa: cada sobra ou falta lançada na abertura ou no fechamento. */
function CashBreaks() {
  const { active } = useCompany();
  const companyId = active?.company.id ?? "";

  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => toISODate(new Date()));
  const [cashId, setCashId] = useState("");
  const [cashAccounts, setCashAccounts] = useState<AccountWithBalance[]>([]);
  const [rows, setRows] = useState<CashBreak[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      listAccountsWithBalance("caixa"),
      companyId ? listCompanyMembers(companyId) : Promise.resolve([])
    ])
      .then(([accounts, members]) => {
        if (active) {
          setCashAccounts(accounts.filter(account => account.cash_role === "operacao"));
          setNames(new Map(members.map(member => [member.userId, member.fullName || member.email])));
        }
      })
      .catch(() => {
        // Sem a lista de caixas o filtro fica só com "Todos"
      });

    return () => {
      active = false;
    };
  }, [companyId]);

  useEffect(() => {
    let active = true;

    if (startDate > endDate) {
      return;
    }

    listCashBreaks({ startDate, endDate, cashAccountId: cashId })
      .then(data => {
        if (active) {
          setRows(data);
          setErrorMessage("");
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar o relatório.");
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
  }, [startDate, endDate, cashId]);

  const totals = useMemo(() => {
    const surplus = rows.filter(row => row.difference > 0).reduce((sum, row) => sum + row.difference, 0);
    const shortage = rows.filter(row => row.difference < 0).reduce((sum, row) => sum + row.difference, 0);

    return {
      count: rows.length,
      surplus: Math.round(surplus * 100) / 100,
      shortage: Math.round(Math.abs(shortage) * 100) / 100,
      result: Math.round((surplus + shortage) * 100) / 100
    };
  }, [rows]);

  return (
    <div className="breaks-page">
      <section className="breaks-header">
        <div>
          <h2>Quebra de caixa</h2>
          <p>Cada sobra ou falta confirmada na abertura ou no fechamento dos caixas.</p>
        </div>
      </section>

      <section className="breaks-filters">
        <label>
          De
          <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
        </label>

        <label>
          Até
          <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
        </label>

        <label>
          Caixa
          <select value={cashId} onChange={event => setCashId(event.target.value)}>
            <option value="">Todos os caixas</option>
            {cashAccounts.map(account => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>
      </section>

      {startDate > endDate && (
        <div className="breaks-state breaks-state-error">A data inicial não pode ser maior que a final.</div>
      )}

      <section className="breaks-summary">
        <div>
          <span>Quebras</span>
          <strong>{totals.count}</strong>
        </div>
        <div>
          <span>Sobras</span>
          <strong className="is-income">+ {formatCurrency(totals.surplus)}</strong>
        </div>
        <div>
          <span>Faltas</span>
          <strong className="is-expense">− {formatCurrency(totals.shortage)}</strong>
        </div>
        <div>
          <span>Resultado</span>
          <strong className={totals.result > 0 ? "is-income" : totals.result < 0 ? "is-expense" : ""}>
            {formatCurrency(totals.result)}
          </strong>
        </div>
      </section>

      {errorMessage ? (
        <div className="breaks-state breaks-state-error">{errorMessage}</div>
      ) : loading ? (
        <div className="breaks-state">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="breaks-state">
          <AlertTriangle size={22} />
          Nenhuma quebra de caixa neste período. Bom sinal!
        </div>
      ) : (
        <div className="breaks-table-wrapper">
          <table className="breaks-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Caixa</th>
                <th>Momento</th>
                <th>Quem</th>
                <th className="is-number">Esperado</th>
                <th className="is-number">Contado</th>
                <th className="is-number">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    {formatDate(row.date)}
                    <small>{formatTime(row.createdAt)}</small>
                  </td>
                  <td>{row.cashName}</td>
                  <td>{row.moment === "abertura" ? "Abertura" : "Fechamento"}</td>
                  <td>{(row.userId && names.get(row.userId)) || "—"}</td>
                  <td className="is-number">{row.expected === null ? "—" : formatCurrency(row.expected)}</td>
                  <td className="is-number">{row.counted === null ? "—" : formatCurrency(row.counted)}</td>
                  <td className={`is-number ${row.difference > 0 ? "is-income" : "is-expense"}`}>
                    <strong>{formatCurrency(row.difference)}</strong>
                    <small>{row.difference > 0 ? "sobra" : "falta"}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CashBreaks;
