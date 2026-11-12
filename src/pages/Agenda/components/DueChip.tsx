import type { CSSProperties } from "react";

import { ArrowDownLeft, ArrowUpRight, Check } from "lucide-react";

import type { AgendaDue } from "../../../services/agendaDuesService";
import { DUE_COLORS, formatMoney } from "../agendaUtils";

type DueChipProps = {
  due: AgendaDue;
  onOpen: (due: AgendaDue) => void;
  /** Lista: mostra também fornecedor/cliente */
  detailed?: boolean;
};

/** Vencimento de conta a pagar/receber na agenda (mesmo formato dos agendamentos). */
function DueChip({ due, onOpen, detailed = false }: DueChipProps) {
  const Icon = due.kind === "receber" ? ArrowDownLeft : ArrowUpRight;
  const label = due.kind === "receber" ? "A receber" : "A pagar";

  return (
    <button
      type="button"
      className={[
        "agenda-chip",
        "agenda-due",
        `is-${due.kind}`,
        due.done ? "is-done" : "",
        due.overdue ? "is-overdue" : "",
        detailed ? "is-detailed" : ""
      ].join(" ")}
      style={{ "--chip-color": DUE_COLORS[due.kind] } as CSSProperties}
      onClick={event => {
        event.stopPropagation();
        onOpen(due);
      }}
      title={`${label}${due.done ? (due.kind === "receber" ? " (recebida)" : " (paga)") : due.overdue ? " (vencida)" : ""} · ${formatMoney(due.value)} · ${due.description}${due.counterparty ? ` · ${due.counterparty}` : ""}`}
    >
      {due.done ? <Check size={11} className="agenda-due-icon" /> : <Icon size={11} className="agenda-due-icon" />}
      <span className="agenda-chip-time">{formatMoney(due.value)}</span>
      <span className="agenda-chip-text">
        {due.description}
        {detailed && due.counterparty ? ` · ${due.counterparty}` : ""}
      </span>
    </button>
  );
}

export default DueChip;
