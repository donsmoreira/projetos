import { useNavigate } from "react-router-dom";

import { ExternalLink } from "lucide-react";

import type { AgendaDue } from "../../../services/agendaDuesService";
import { formatMoney, fromISO } from "../agendaUtils";

type DueDetailsProps = {
  due: AgendaDue;
  onClose: () => void;
};

/** Resumo do vencimento clicado na agenda, com atalho para a tela da conta. */
function DueDetails({ due, onClose }: DueDetailsProps) {
  const navigate = useNavigate();
  const isReceivable = due.kind === "receber";

  const status = due.done
    ? isReceivable ? "Recebida" : "Paga"
    : due.overdue ? "Vencida" : "Em aberto";

  const rows: [string, string][] = [
    [isReceivable ? "Cliente" : "Fornecedor", due.counterparty ?? "—"],
    ["Vencimento", fromISO(due.dueDate).toLocaleDateString("pt-BR")],
    [due.done ? (isReceivable ? "Valor recebido" : "Valor pago") : "Valor", formatMoney(due.value)],
    ["Situação", status]
  ];

  if (due.installment) {
    rows.splice(1, 0, ["Parcela", due.installment]);
  }

  if (due.done && due.doneDate) {
    rows.push([isReceivable ? "Recebida em" : "Paga em", fromISO(due.doneDate).toLocaleDateString("pt-BR")]);
  }

  return (
    <div className="arc-form">
      <div className={`agenda-due-summary is-${due.kind} ${due.overdue ? "is-overdue" : ""}`}>
        <span>{isReceivable ? "Conta a receber" : "Conta a pagar"}</span>
        <strong>{due.description}</strong>
      </div>

      <dl className="agenda-due-details">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="arc-form-actions">
        <button type="button" className="arc-button arc-button-secondary" onClick={onClose}>
          Fechar
        </button>
        <button
          type="button"
          className="arc-button arc-button-primary"
          onClick={() => navigate(isReceivable ? "/contas-receber" : "/contas-pagar")}
        >
          <ExternalLink size={14} />
          Abrir em {isReceivable ? "Contas a Receber" : "Contas a Pagar"}
        </button>
      </div>
    </div>
  );
}

export default DueDetails;
