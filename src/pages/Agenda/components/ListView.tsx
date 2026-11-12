import type { CSSProperties } from "react";
import type { Appointment } from "../../../types/appointment";
import { APPOINTMENT_STATUS_LABELS } from "../../../types/appointment";
import { formatMoney, fromISO } from "../agendaUtils";
import type { AgendaDue } from "../../../services/agendaDuesService";
import DueChip from "./DueChip";

type ListViewProps = {
  appointments: Appointment[];
  dues: AgendaDue[];
  onOpenDue: (due: AgendaDue) => void;
  nameOf: (responsibleId: string | null) => string;
  onOpen: (appointment: Appointment) => void;
};

/** Lista dos agendamentos agrupada por dia. */
function ListView({ appointments, dues, onOpenDue, nameOf, onOpen }: ListViewProps) {
  if (appointments.length === 0 && dues.length === 0) {
    return <div className="agenda-empty">Nenhum agendamento ou vencimento neste período.</div>;
  }

  const groups = new Map<string, Appointment[]>();
  const dueGroups = new Map<string, AgendaDue[]>();

  for (const appointment of appointments) {
    const list = groups.get(appointment.appointment_date) ?? [];
    list.push(appointment);
    groups.set(appointment.appointment_date, list);
  }

  for (const due of dues) {
    const list = dueGroups.get(due.dueDate) ?? [];
    list.push(due);
    dueGroups.set(due.dueDate, list);

    if (!groups.has(due.dueDate)) {
      groups.set(due.dueDate, []);
    }
  }

  const dates = [...groups.keys()].sort();

  return (
    <div className="agenda-list">
      {dates.map(date => {
        const list = groups.get(date) ?? [];
        const label = fromISO(date).toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long"
        });

        return (
          <section key={date} className="agenda-list-day">
            <h4>{label.charAt(0).toUpperCase() + label.slice(1)}</h4>

            {(dueGroups.get(date) ?? []).length > 0 && (
              <div className="agenda-list-dues">
                {(dueGroups.get(date) ?? []).map(due => (
                  <DueChip key={due.key} due={due} onOpen={onOpenDue} detailed />
                ))}
              </div>
            )}

            {list.map(appointment => (
              <button
                key={appointment.id}
                type="button"
                className={`agenda-list-item is-${appointment.status}`}
                style={{ "--chip-color": appointment.color } as CSSProperties}
                onClick={() => onOpen(appointment)}
              >
                <span className="agenda-list-time">
                  {appointment.start_time}
                  <small>{appointment.end_time}</small>
                </span>

                <span className="agenda-list-main">
                  <strong>{appointment.clients?.name ?? (appointment.title || "Compromisso")}</strong>
                  <small>
                    {appointment.clients ? appointment.title || "Sem assunto" : "Sem cliente"} · {nameOf(appointment.responsible_id)}
                  </small>
                </span>

                {appointment.amount !== null && (
                  <span className="agenda-list-amount">{formatMoney(appointment.amount)}</span>
                )}

                <span className={`agenda-status is-${appointment.status}`}>
                  {APPOINTMENT_STATUS_LABELS[appointment.status]}
                </span>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export default ListView;
