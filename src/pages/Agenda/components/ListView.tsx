import type { CSSProperties } from "react";
import type { Appointment } from "../../../types/appointment";
import { APPOINTMENT_STATUS_LABELS } from "../../../types/appointment";
import { formatMoney, fromISO } from "../agendaUtils";

type ListViewProps = {
  appointments: Appointment[];
  colorOf: (responsibleId: string | null) => string;
  nameOf: (responsibleId: string | null) => string;
  onOpen: (appointment: Appointment) => void;
};

/** Lista dos agendamentos agrupada por dia. */
function ListView({ appointments, colorOf, nameOf, onOpen }: ListViewProps) {
  if (appointments.length === 0) {
    return <div className="agenda-empty">Nenhum agendamento neste período.</div>;
  }

  const groups = new Map<string, Appointment[]>();

  for (const appointment of appointments) {
    const list = groups.get(appointment.appointment_date) ?? [];
    list.push(appointment);
    groups.set(appointment.appointment_date, list);
  }

  return (
    <div className="agenda-list">
      {[...groups.entries()].map(([date, list]) => {
        const label = fromISO(date).toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long"
        });

        return (
          <section key={date} className="agenda-list-day">
            <h4>{label.charAt(0).toUpperCase() + label.slice(1)}</h4>

            {list.map(appointment => (
              <button
                key={appointment.id}
                type="button"
                className={`agenda-list-item is-${appointment.status}`}
                style={{ "--chip-color": colorOf(appointment.responsible_id) } as CSSProperties}
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
