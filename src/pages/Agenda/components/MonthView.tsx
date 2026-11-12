import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Appointment } from "../../../types/appointment";
import type { DragPreview } from "../useAppointmentDrag";
import type { AgendaDue } from "../../../services/agendaDuesService";
import DueChip from "./DueChip";
import {
  WEEKDAYS_SHORT,
  addDays,
  monthGridStart,
  toISO
} from "../agendaUtils";

type MonthViewProps = {
  cursor: Date;
  appointments: Appointment[];
  /** Vencimentos de contas a pagar/receber */
  dues: AgendaDue[];
  onOpenDue: (due: AgendaDue) => void;
  onOpen: (appointment: Appointment) => void;
  onOpenDay: (date: Date) => void;
  onCreate?: (date: string) => void;
  /** Arrastar para outro dia */
  dragPreview: DragPreview | null;
  onDragStart?: (event: ReactPointerEvent<HTMLElement>, appointment: Appointment) => void;
  consumeClick: () => boolean;
};

const MAX_PER_DAY = 3;

/** Calendário do mês: até 3 horários por dia e "+N" para ver o dia todo. */
function MonthView({
  cursor,
  appointments,
  dues,
  onOpenDue,
  onOpen,
  onOpenDay,
  onCreate,
  dragPreview,
  onDragStart,
  consumeClick
}: MonthViewProps) {
  const start = monthGridStart(cursor);
  const today = toISO(new Date());
  const byDate = new Map<string, Appointment[]>();

  for (const appointment of appointments) {
    const list = byDate.get(appointment.appointment_date) ?? [];
    list.push(appointment);
    byDate.set(appointment.appointment_date, list);
  }

  const duesByDate = new Map<string, AgendaDue[]>();

  for (const due of dues) {
    const list = duesByDate.get(due.dueDate) ?? [];
    list.push(due);
    duesByDate.set(due.dueDate, list);
  }

  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));

  return (
    <div className="agenda-month">
      {WEEKDAYS_SHORT.map(day => (
        <div key={day} className="agenda-month-weekday">{day}</div>
      ))}

      {days.map(day => {
        const iso = toISO(day);
        const list = byDate.get(iso) ?? [];
        const dayDues = duesByDate.get(iso) ?? [];
        // Vencimentos primeiro; o que sobrar das 3 linhas vai para os agendamentos
        const shownDues = dayDues.slice(0, MAX_PER_DAY);
        const shownAppointments = list.slice(0, MAX_PER_DAY - shownDues.length);
        const hidden = dayDues.length + list.length - shownDues.length - shownAppointments.length;
        const otherMonth = day.getMonth() !== cursor.getMonth();

        return (
          <div
            key={iso}
            className={[
              "agenda-month-cell",
              otherMonth ? "is-other-month" : "",
              iso === today ? "is-today" : "",
              dragPreview?.targetDate === iso ? "is-drop-target" : ""
            ].join(" ")}
            data-drop-date={iso}
            onClick={() => {
              if (!consumeClick()) {
                onCreate?.(iso);
              }
            }}
            role={onCreate ? "button" : undefined}
            tabIndex={onCreate ? 0 : undefined}
            onKeyDown={event => {
              if (onCreate && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onCreate(iso);
              }
            }}
            aria-label={onCreate ? `Novo agendamento em ${day.toLocaleDateString("pt-BR")}` : undefined}
          >
            <button
              type="button"
              className="agenda-month-day"
              onClick={event => {
                event.stopPropagation();
                onOpenDay(day);
              }}
              title="Ver o dia"
            >
              {day.getDate()}
            </button>

            <div className="agenda-month-items">
              {shownDues.map(due => (
                <DueChip key={due.key} due={due} onOpen={onOpenDue} />
              ))}

              {shownAppointments.map(appointment => (
                <button
                  key={appointment.id}
                  type="button"
                  className={[
                    "agenda-chip",
                    `is-${appointment.status}`,
                    onDragStart && appointment.status !== "concluido" ? "is-draggable" : "",
                    dragPreview?.appointmentId === appointment.id ? "is-dragging" : ""
                  ].join(" ")}
                  style={{ "--chip-color": appointment.color } as CSSProperties}
                  // Concluído não se move
                    onPointerDown={onDragStart && appointment.status !== "concluido" ? event => onDragStart(event, appointment) : undefined}
                  onContextMenu={onDragStart && appointment.status !== "concluido" ? event => event.preventDefault() : undefined}
                  onClick={event => {
                    event.stopPropagation();
                    if (!consumeClick()) {
                      onOpen(appointment);
                    }
                  }}
                  title={`${appointment.start_time} · ${appointment.clients?.name ?? ""} · ${appointment.title}`}
                >
                  <span className="agenda-chip-dot" />
                  <span className="agenda-chip-time">{appointment.start_time}</span>
                  <span className="agenda-chip-text">{appointment.clients?.name ?? (appointment.title || "Compromisso")}</span>
                </button>
              ))}

              {hidden > 0 && (
                <button
                  type="button"
                  className="agenda-month-more"
                  onClick={event => {
                    event.stopPropagation();
                    onOpenDay(day);
                  }}
                >
                  + {hidden} mais
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default MonthView;
