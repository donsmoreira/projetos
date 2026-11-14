import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";

import { CalendarDays, Check } from "lucide-react";

import { listAppointments } from "../../../services/appointmentsService";
import { listAgendaDues } from "../../../services/agendaDuesService";
import type { AgendaDue } from "../../../services/agendaDuesService";
import type { Appointment } from "../../../types/appointment";

import { usePermissions } from "../../../hooks/useCompany";

import {
  DUE_COLORS,
  WEEKDAYS_SHORT,
  addDays,
  formatMoney,
  fromISO,
  startOfWeek,
  toISO
} from "../../Agenda/agendaUtils";

type DayItems = {
  date: string;
  appointments: Appointment[];
  dues: AgendaDue[];
};

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

/** Quadro de avisos: agendamentos e vencimentos da semana atual (domingo a sábado). */
function WeekBoard() {
  const agenda = usePermissions("agenda");
  const payables = usePermissions("contas_pagar");
  const receivables = usePermissions("contas_receber");

  const showAppointments = agenda.canView;
  const showPayables = payables.canView;
  const showReceivables = receivables.canView;

  const today = toISO(new Date());
  const weekStart = toISO(startOfWeek(new Date()));
  const weekEnd = toISO(addDays(fromISO(weekStart), 6));

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dues, setDues] = useState<AgendaDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      showAppointments ? listAppointments(weekStart, weekEnd) : Promise.resolve([]),
      showPayables || showReceivables
        ? listAgendaDues(weekStart, weekEnd, { payables: showPayables, receivables: showReceivables })
        : Promise.resolve([])
    ])
      .then(([appointmentRows, dueRows]) => {
        if (active) {
          setAppointments(appointmentRows.filter(item => item.status !== "cancelado"));
          setDues(dueRows.filter(item => !item.done));
          setErrorMessage("");
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar a semana.");
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
  }, [weekStart, weekEnd, showAppointments, showPayables, showReceivables]);

  const days = useMemo(() => {
    const list: DayItems[] = [];

    for (let index = 0; index < 7; index += 1) {
      const date = toISO(addDays(fromISO(weekStart), index));

      list.push({
        date,
        appointments: appointments
          .filter(item => item.appointment_date === date)
          .sort((a, b) => a.start_time.localeCompare(b.start_time)),
        dues: dues.filter(item => item.dueDate === date)
      });
    }

    return list;
  }, [appointments, dues, weekStart]);

  if (!showAppointments && !showPayables && !showReceivables) {
    return null;
  }

  const toPay = dues.filter(item => item.kind === "pagar");
  const toReceive = dues.filter(item => item.kind === "receber");
  const sum = (items: AgendaDue[]) => items.reduce((total, item) => total + item.value, 0);

  // Dias que já passaram e não têm nada ficam escondidos
  const visibleDays = days.filter(
    day => day.date >= today || day.appointments.length > 0 || day.dues.length > 0
  );

  return (
    <section className="dashboard-section week-board">
      <header className="dashboard-section-title">
        <div>
          <h3>Quadro de avisos da semana</h3>
          <p>
            {shortDate(weekStart)} a {shortDate(weekEnd)} · agendamentos e vencimentos em aberto
          </p>
        </div>

        {showAppointments && (
          <Link to="/agenda" className="week-board-link">
            <CalendarDays size={15} /> Abrir agenda
          </Link>
        )}
      </header>

      <div className="week-board-totals">
        {showAppointments && (
          <span><strong>{appointments.length}</strong> agendamento{appointments.length === 1 ? "" : "s"}</span>
        )}
        {showPayables && (
          <span className="is-pay">
            <strong>{toPay.length}</strong> a pagar · {formatMoney(sum(toPay))}
          </span>
        )}
        {showReceivables && (
          <span className="is-receive">
            <strong>{toReceive.length}</strong> a receber · {formatMoney(sum(toReceive))}
          </span>
        )}
      </div>

      {loading ? (
        <div className="week-board-empty">Carregando a semana...</div>
      ) : errorMessage ? (
        <div className="week-board-empty is-error">{errorMessage}</div>
      ) : appointments.length === 0 && dues.length === 0 ? (
        <div className="week-board-empty">Nada marcado e nenhum vencimento em aberto nesta semana.</div>
      ) : (
        <ol className="week-board-days">
          {visibleDays.map(day => {
            const weekday = WEEKDAYS_SHORT[fromISO(day.date).getDay()];
            const empty = day.appointments.length === 0 && day.dues.length === 0;

            return (
              <li
                key={day.date}
                className={`week-board-day${day.date === today ? " is-today" : ""}${day.date < today ? " is-past" : ""}`}
              >
                <div className="week-board-date">
                  <strong>{day.date === today ? "Hoje" : weekday}</strong>
                  <span>{shortDate(day.date)}</span>
                </div>

                {empty ? (
                  <p className="week-board-nothing">Livre</p>
                ) : (
                  <ul className="week-board-items">
                    {day.appointments.map(item => (
                      <li key={item.id}>
                        <i className="week-board-dot" style={{ background: item.color }} aria-hidden="true" />
                        <span className="week-board-time">{item.start_time.slice(0, 5)}</span>
                        <span className="week-board-text">
                          {item.title || "Agendamento"}
                          {item.clients?.name ? ` · ${item.clients.name}` : ""}
                        </span>
                        <span className="week-board-end">
                          {item.status === "concluido" && (
                            <span className="week-board-done" title="Concluído"><Check size={13} /></span>
                          )}
                        </span>
                      </li>
                    ))}

                    {day.dues.map(item => (
                      <li key={item.key} className={item.overdue ? "is-overdue" : ""}>
                        <i className="week-board-dot" style={{ background: DUE_COLORS[item.kind] }} aria-hidden="true" />
                        <span className="week-board-time">{item.kind === "pagar" ? "Pagar" : "Receber"}</span>
                        <span className="week-board-text">
                          {item.description}
                          {item.counterparty ? ` · ${item.counterparty}` : ""}
                          {item.overdue ? " · vencida" : ""}
                        </span>
                        <strong className={`week-board-end ${item.kind === "pagar" ? "is-pay" : "is-receive"}`}>
                          {formatMoney(item.value)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default WeekBoard;
