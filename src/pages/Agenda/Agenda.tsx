import { useCallback, useEffect, useState } from "react";

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import Modal from "../../components/Modal/Modal";
import { useAuth } from "../../contexts/AuthContext";
import { useCompany, usePermissions } from "../../hooks/useCompany";
import {
  findConflicts,
  listAppointments,
  updateAppointment
} from "../../services/appointmentsService";
import { listClients } from "../../services/clientsService";
import { listCompanyMembers } from "../../services/companyService";

import type { Appointment, AppointmentFormData } from "../../types/appointment";
import { APPOINTMENT_STATUS_LABELS } from "../../types/appointment";
import { useAppointmentDrag } from "./useAppointmentDrag";
import type { Client } from "../../types/client";

import AppointmentForm from "./components/AppointmentForm";
import type { Member } from "./components/AppointmentForm";
import CompleteAppointmentForm from "./components/CompleteAppointmentForm";
import ListView from "./components/ListView";
import MonthView from "./components/MonthView";
import TimeGridView from "./components/TimeGridView";
import {
  VIEW_LABELS,
  addDays,
  minutes,
  timeFrom,
  rangeFor,
  shift,
  startOfWeek,
  titleFor,
  toISO
} from "./agendaUtils";
import type { AgendaView } from "./agendaUtils";

import "../Cash/Cash.css";
import "./Agenda.css";

const VIEW_KEY = "arc-agenda-visao";

function savedView(): AgendaView {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return value === "semana" || value === "dia" || value === "lista" ? value : "mes";
  } catch {
    return "mes";
  }
}

type ModalState =
  | { kind: "form"; appointment: Appointment | null; date: string; time: string }
  | { kind: "complete"; appointment: Appointment }
  | null;

function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Agenda: horários por cliente e responsável, em mês, semana, dia ou lista. */
function Agenda() {
  const { user } = useAuth();
  const { active } = useCompany();
  const permissions = usePermissions("agenda");
  const receivablePermissions = usePermissions("contas_receber");
  const companyId = active?.company.id ?? "";

  // Abre no mês (ou na última visão escolhida neste navegador)
  const [view, setView] = useState<AgendaView>(savedView);
  const [cursor, setCursor] = useState<Date>(today);
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [modal, setModal] = useState<ModalState>(null);

  const range = rangeFor(view, cursor);
  const startISO = toISO(range.start);
  const endISO = toISO(range.end);

  const load = useCallback(async () => {
    const data = await listAppointments(startISO, endISO);
    setAppointments(data);
  }, [startISO, endISO]);

  useEffect(() => {
    let active = true;

    listAppointments(startISO, endISO)
      .then(data => {
        if (active) {
          setAppointments(data);
          setErrorMessage("");
        }
      })
      .catch(error => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar a agenda.");
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
  }, [startISO, endISO]);

  useEffect(() => {
    let active = true;

    Promise.all([
      companyId ? listCompanyMembers(companyId) : Promise.resolve([]),
      listClients()
    ])
      .then(([memberList, clientList]) => {
        if (active) {
          setMembers(memberList.map(member => ({
            userId: member.userId,
            name: member.fullName || member.email
          })));
          setClients(clientList);
        }
      })
      .catch(() => {
        // Sem a lista, o formulário mostra "Nenhum cliente cadastrado"
      });

    return () => {
      active = false;
    };
  }, [companyId]);

  const nameOf = useCallback(
    (id: string | null) => members.find(member => member.userId === id)?.name ?? "Sem responsável",
    [members]
  );

  /** Soltou o agendamento em outro dia/horário: confere conflito e salva */
  const moveAppointment = useCallback(async (
    appointment: Appointment,
    date: string,
    startMinutes: number | null
  ) => {
    // Concluído não se move (o banco também recusa)
    if (appointment.status === "concluido") {
      return;
    }

    const duration = minutes(appointment.end_time) - minutes(appointment.start_time);
    const start = startMinutes ?? minutes(appointment.start_time);
    const startTime = timeFrom(start);
    const endTime = timeFrom(start + duration);

    if (date === appointment.appointment_date && startTime === appointment.start_time) {
      return;
    }

    const form: AppointmentFormData = {
      clientId: appointment.client_id ?? "",
      title: appointment.title,
      date,
      startTime,
      endTime,
      amount: appointment.amount ?? 0,
      color: appointment.color,
      responsibleId: appointment.responsible_id ?? "",
      status: appointment.status,
      notes: appointment.notes ?? ""
    };

    try {
      if (appointment.status !== "cancelado" && appointment.status !== "faltou") {
        const conflicts = await findConflicts(form, appointment.id);

        if (conflicts.length > 0) {
          const list = conflicts
            .map(item => `• ${item.start_time}–${item.end_time} ${item.clients?.name ?? item.title ?? ""} (${APPOINTMENT_STATUS_LABELS[item.status]})`)
            .join("\n");
          const who = members.find(member => member.userId === appointment.responsible_id)?.name ?? "O responsável";

          if (!window.confirm(`${who} já tem horário neste período:\n${list}\n\nMover mesmo assim?`)) {
            return;
          }
        }
      }

      // Mostra já no lugar novo enquanto salva
      setAppointments(current => current.map(item =>
        item.id === appointment.id
          ? { ...item, appointment_date: date, start_time: startTime, end_time: endTime }
          : item
      ));

      await updateAppointment(appointment.id, form);
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível mover o agendamento.");
      await load().catch(() => undefined);
    }
  }, [members, load]);

  const drag = useAppointmentDrag(permissions.canUpdate, (appointment, date, start) => {
    void moveAppointment(appointment, date, start);
  });

  const visible = responsibleFilter
    ? appointments.filter(item => item.responsible_id === responsibleFilter)
    : appointments;

  function changeView(next: AgendaView) {
    setView(next);

    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // só não lembra a visão
    }
  }

  function openNew(date: string, time = "09:00") {
    setModal({ kind: "form", appointment: null, date, time });
  }

  async function handleSaved() {
    setModal(null);
    await load();
  }

  const defaultResponsible =
    responsibleFilter ||
    (user && members.some(member => member.userId === user.id) ? user.id : "");

  const days =
    view === "semana"
      ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index))
      : [cursor];

  return (
    <div className="agenda-page">
      <section className="agenda-toolbar">
        <div className="agenda-nav">
          <button type="button" className="agenda-today" onClick={() => setCursor(today())}>
            Hoje
          </button>
          <button type="button" className="agenda-arrow" onClick={() => setCursor(shift(view, cursor, -1))} aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="agenda-arrow" onClick={() => setCursor(shift(view, cursor, 1))} aria-label="Próximo">
            <ChevronRight size={18} />
          </button>
          <h2>{titleFor(view, cursor)}</h2>
        </div>

        <div className="agenda-controls">
          <select
            value={responsibleFilter}
            onChange={event => setResponsibleFilter(event.target.value)}
            aria-label="Agenda de quem"
          >
            <option value="">Todos os responsáveis</option>
            {members.map(member => (
              <option key={member.userId} value={member.userId}>{member.name}</option>
            ))}
          </select>

          <div className="agenda-views" role="tablist" aria-label="Visão da agenda">
            {(Object.keys(VIEW_LABELS) as AgendaView[]).map(item => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                className={view === item ? "is-active" : ""}
                onClick={() => changeView(item)}
              >
                {VIEW_LABELS[item]}
              </button>
            ))}
          </div>

          {permissions.canCreate && (
            <button
              type="button"
              className="agenda-new"
              onClick={() => openNew(view === "mes" || view === "lista" ? toISO(cursor) : toISO(cursor))}
            >
              <CalendarPlus size={16} />
              Novo agendamento
            </button>
          )}
        </div>
      </section>

      {members.length > 1 && (
        <section className="agenda-legend">
          {members.map(member => (
            <button
              key={member.userId}
              type="button"
              className={responsibleFilter === member.userId ? "is-active" : ""}
              onClick={() => setResponsibleFilter(current => current === member.userId ? "" : member.userId)}
            >
              {member.name}
            </button>
          ))}
        </section>
      )}

      {errorMessage ? (
        <div className="agenda-empty agenda-error">{errorMessage}</div>
      ) : loading ? (
        <div className="agenda-empty">Carregando agenda...</div>
      ) : view === "mes" ? (
        <MonthView
          cursor={cursor}
          appointments={visible}
          onOpen={appointment => setModal({ kind: "form", appointment, date: "", time: "" })}
          onOpenDay={day => {
            setCursor(day);
            changeView("dia");
          }}
          onCreate={permissions.canCreate ? date => openNew(date) : undefined}
          dragPreview={drag.preview}
          onDragStart={permissions.canUpdate ? drag.startDrag : undefined}
          consumeClick={drag.consumeClick}
        />
      ) : view === "lista" ? (
        <ListView
          appointments={visible}
          nameOf={nameOf}
          onOpen={appointment => setModal({ kind: "form", appointment, date: "", time: "" })}
        />
      ) : (
        <TimeGridView
          days={days}
          appointments={visible}
          nameOf={nameOf}
          onOpen={appointment => setModal({ kind: "form", appointment, date: "", time: "" })}
          onCreate={permissions.canCreate ? (date, time) => openNew(date, time) : undefined}
          dragPreview={drag.preview}
          onDragStart={permissions.canUpdate ? drag.startDrag : undefined}
          consumeClick={drag.consumeClick}
        />
      )}

      {modal?.kind === "form" && (
        <Modal
          title={modal.appointment ? "Agendamento" : "Novo agendamento"}
          subtitle={modal.appointment ? modal.appointment.clients?.name ?? (modal.appointment.title || "Sem cliente") : "Cliente (opcional), horário e responsável"}
          onClose={() => setModal(null)}
        >
          <AppointmentForm
            appointment={modal.appointment}
            initialDate={modal.date}
            initialTime={modal.time}
            defaultResponsibleId={defaultResponsible}
            clients={clients}
            members={members}
            canCreate={permissions.canCreate}
            canUpdate={permissions.canUpdate}
            canDelete={permissions.canDelete}
            onCancel={() => setModal(null)}
            onSaved={handleSaved}
            onComplete={appointment => setModal({ kind: "complete", appointment })}
          />
        </Modal>
      )}

      {modal?.kind === "complete" && (
        <Modal
          title="Concluir atendimento"
          subtitle={modal.appointment.clients?.name ?? ""}
          onClose={() => setModal(null)}
        >
          <CompleteAppointmentForm
            appointment={modal.appointment}
            canCreateReceivable={receivablePermissions.canCreate}
            onCancel={() => setModal({ kind: "form", appointment: modal.appointment, date: "", time: "" })}
            onSaved={handleSaved}
          />
        </Modal>
      )}
    </div>
  );
}

export default Agenda;
