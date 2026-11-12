import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { DragPreview } from "../useAppointmentDrag";
import { useEffect, useRef } from "react";

import type { Appointment } from "../../../types/appointment";
import { APPOINTMENT_STATUS_LABELS } from "../../../types/appointment";
import {
  FIRST_HOUR,
  HOUR_PX,
  LAST_HOUR,
  WEEKDAYS_SHORT,
  layoutDay,
  minutes,
  timeFrom,
  toISO
} from "../agendaUtils";

type TimeGridViewProps = {
  /** 1 dia (visão Dia) ou 7 dias (visão Semana) */
  days: Date[];
  appointments: Appointment[];
  nameOf: (responsibleId: string | null) => string;
  onOpen: (appointment: Appointment) => void;
  onCreate?: (date: string, time: string) => void;
  /** Arrastar para outro dia/horário */
  dragPreview: DragPreview | null;
  onDragStart?: (event: ReactPointerEvent<HTMLElement>, appointment: Appointment) => void;
  consumeClick: () => boolean;
};

const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, index) => FIRST_HOUR + index);
const TOTAL_PX = (LAST_HOUR - FIRST_HOUR) * HOUR_PX;

/** Linha do tempo de um ou mais dias, com os horários posicionados pela hora. */
function TimeGridView({
  days,
  appointments,
  nameOf,
  onOpen,
  onCreate,
  dragPreview,
  onDragStart,
  consumeClick
}: TimeGridViewProps) {
  const today = toISO(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Abre já mostrando a partir das 8h
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - FIRST_HOUR) * HOUR_PX;
    }
  }, []);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - FIRST_HOUR * 60) / 60) * HOUR_PX;

  return (
    <div className={`agenda-grid ${days.length === 1 ? "is-day" : "is-week"}`}>
      <div className="agenda-grid-head">
        <div className="agenda-grid-corner" />
        {days.map(day => {
          const iso = toISO(day);
          return (
            <div key={iso} className={`agenda-grid-dayname ${iso === today ? "is-today" : ""}`}>
              <span>{WEEKDAYS_SHORT[day.getDay()]}</span>
              <strong>{day.getDate()}</strong>
            </div>
          );
        })}
      </div>

      <div className="agenda-grid-scroll" ref={scrollRef}>
        <div className="agenda-grid-body" style={{ height: TOTAL_PX }}>
          <div className="agenda-grid-hours">
            {HOURS.map(hour => (
              <div key={hour} className="agenda-grid-hour" style={{ height: HOUR_PX }}>
                <span>{String(hour).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>

          {days.map(day => {
            const iso = toISO(day);
            const items = layoutDay(appointments.filter(item => item.appointment_date === iso));

            return (
              <div
                key={iso}
                className={`agenda-grid-column ${dragPreview?.targetDate === iso ? "is-drop-target" : ""}`}
                data-drop-date={iso}
                data-drop-grid=""
                onClick={event => {
                  if (consumeClick() || !onCreate) {
                    return;
                  }

                  // Clique num horário vazio: novo agendamento naquela meia hora
                  const rect = event.currentTarget.getBoundingClientRect();
                  const offset = event.clientY - rect.top;
                  const slot = Math.floor((offset / HOUR_PX) * 2) * 30 + FIRST_HOUR * 60;
                  onCreate(iso, timeFrom(slot));
                }}
              >
                {HOURS.map(hour => (
                  <div key={hour} className="agenda-grid-slot" style={{ height: HOUR_PX }} />
                ))}

                {iso === today && nowTop >= 0 && nowTop <= TOTAL_PX && (
                  <div className="agenda-grid-now" style={{ top: nowTop }} />
                )}

                {dragPreview?.targetDate === iso && dragPreview.targetStart !== null && (
                  <div
                    className="agenda-drop-ghost"
                    style={{
                      top: ((dragPreview.targetStart - FIRST_HOUR * 60) / 60) * HOUR_PX,
                      height: Math.max((dragPreview.duration / 60) * HOUR_PX, 20)
                    }}
                  >
                    {timeFrom(dragPreview.targetStart)}–{timeFrom(dragPreview.targetStart + dragPreview.duration)}
                  </div>
                )}

                {items.map(({ appointment, top, height, lane, lanes }) => (
                  <button
                    key={appointment.id}
                    type="button"
                    className={[
                      "agenda-event",
                      `is-${appointment.status}`,
                      onDragStart && appointment.status !== "concluido" ? "is-draggable" : "",
                      dragPreview?.appointmentId === appointment.id ? "is-dragging" : ""
                    ].join(" ")}
                    // Concluído não se move
                    onPointerDown={onDragStart && appointment.status !== "concluido" ? event => onDragStart(event, appointment) : undefined}
                    onContextMenu={onDragStart && appointment.status !== "concluido" ? event => event.preventDefault() : undefined}
                    style={{
                      top: Math.min(Math.max(top, 0), TOTAL_PX - 20),
                      height,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                      "--chip-color": appointment.color
                    } as CSSProperties}
                    onClick={event => {
                      event.stopPropagation();
                      if (!consumeClick()) {
                        onOpen(appointment);
                      }
                    }}
                    title={`${appointment.start_time}–${appointment.end_time} · ${appointment.clients?.name ?? ""} · ${appointment.title} · ${nameOf(appointment.responsible_id)} · ${APPOINTMENT_STATUS_LABELS[appointment.status]}`}
                  >
                    <strong>{appointment.clients?.name ?? (appointment.title || "Compromisso")}</strong>
                    <span>
                      {appointment.start_time}–{appointment.end_time}
                      {appointment.clients && appointment.title ? ` · ${appointment.title}` : ""}
                    </span>
                    {minutes(appointment.end_time) - minutes(appointment.start_time) >= 45 && (
                      <small>{nameOf(appointment.responsible_id)}</small>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TimeGridView;
