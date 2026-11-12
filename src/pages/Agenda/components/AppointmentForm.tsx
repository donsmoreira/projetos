import { useState } from "react";
import type { FormEvent } from "react";

import { AlertTriangle, Check, CheckCheck, Trash2, UserX, X } from "lucide-react";

import CurrencyInput from "../../../components/CurrencyInput/CurrencyInput";
import {
  createAppointment,
  deleteAppointment,
  findConflicts,
  setAppointmentStatus,
  updateAppointment
} from "../../../services/appointmentsService";

import type { Client } from "../../../types/client";
import type {
  Appointment,
  AppointmentFormData,
  AppointmentStatus
} from "../../../types/appointment";
import { APPOINTMENT_STATUS_LABELS } from "../../../types/appointment";
import { minutes, timeFrom } from "../agendaUtils";

export type Member = { userId: string; name: string };

type AppointmentFormProps = {
  appointment: Appointment | null;
  /** Para um novo: data e hora sugeridas (clique no calendário) */
  initialDate: string;
  initialTime: string;
  defaultResponsibleId: string;
  clients: Client[];
  members: Member[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
  /** Concluir: a tela de cima decide se oferece criar a conta a receber */
  onComplete: (appointment: Appointment) => void;
};

function formFrom(
  appointment: Appointment | null,
  date: string,
  time: string,
  responsibleId: string
): AppointmentFormData {
  if (appointment) {
    return {
      clientId: appointment.client_id ?? "",
      title: appointment.title,
      date: appointment.appointment_date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      amount: appointment.amount ?? 0,
      responsibleId: appointment.responsible_id ?? "",
      status: appointment.status,
      notes: appointment.notes ?? ""
    };
  }

  return {
    clientId: "",
    title: "",
    date,
    startTime: time,
    endTime: timeFrom(minutes(time) + 60),
    amount: 0,
    responsibleId,
    status: "agendado",
    notes: ""
  };
}

/** Novo agendamento ou edição, com aviso de horário ocupado do responsável. */
function AppointmentForm({
  appointment,
  initialDate,
  initialTime,
  defaultResponsibleId,
  clients,
  members,
  canCreate,
  canUpdate,
  canDelete,
  onCancel,
  onSaved,
  onComplete
}: AppointmentFormProps) {
  const [form, setForm] = useState<AppointmentFormData>(() =>
    formFrom(appointment, initialDate, initialTime, defaultResponsibleId)
  );
  const [conflicts, setConflicts] = useState<Appointment[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const editable = appointment ? canUpdate : canCreate;

  function update<K extends keyof AppointmentFormData>(field: K, value: AppointmentFormData[K]) {
    setConflicts(null);
    setErrorMessage("");
    setForm(current => ({ ...current, [field]: value }));
  }

  function nameOf(id: string | null) {
    return members.find(member => member.userId === id)?.name ?? "Sem responsável";
  }

  async function save(ignoreConflicts: boolean) {
    try {
      setSubmitting(true);
      setErrorMessage("");

      if (!ignoreConflicts && form.status !== "cancelado" && form.status !== "faltou") {
        const found = await findConflicts(form, appointment?.id);

        if (found.length > 0) {
          setConflicts(found);
          return;
        }
      }

      if (appointment) {
        await updateAppointment(appointment.id, form);
      } else {
        await createAppointment(form);
      }

      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar o agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Cliente é opcional; sem cliente, precisa pelo menos do assunto
    if (!form.clientId && !form.title.trim()) {
      setErrorMessage("Escolha o cliente ou informe o serviço / assunto.");
      return;
    }

    if (!form.date || !form.startTime || !form.endTime) {
      setErrorMessage("Informe a data e os horários.");
      return;
    }

    if (minutes(form.endTime) <= minutes(form.startTime)) {
      setErrorMessage("O horário de término precisa ser depois do início.");
      return;
    }

    void save(false);
  }

  async function changeStatus(status: AppointmentStatus) {
    if (!appointment) {
      return;
    }

    if (status === "concluido") {
      onComplete(appointment);
      return;
    }

    try {
      setSubmitting(true);
      await setAppointmentStatus(appointment.id, status);
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível mudar o status.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!appointment || !window.confirm("Excluir este agendamento?")) {
      return;
    }

    try {
      setSubmitting(true);
      await deleteAppointment(appointment.id);
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
      setSubmitting(false);
    }
  }

  return (
    <form className="arc-form" onSubmit={handleSubmit}>
      {appointment && canUpdate && (
        <div className="agenda-status-actions">
          <span className={`agenda-status is-${appointment.status}`}>
            {APPOINTMENT_STATUS_LABELS[appointment.status]}
          </span>

          {appointment.status === "agendado" && (
            <button type="button" className="arc-button arc-button-secondary" disabled={submitting} onClick={() => void changeStatus("confirmado")}>
              <Check size={14} /> Confirmar
            </button>
          )}

          {(appointment.status === "agendado" || appointment.status === "confirmado") && (
            <>
              <button type="button" className="arc-button arc-button-primary" disabled={submitting} onClick={() => void changeStatus("concluido")}>
                <CheckCheck size={14} /> Concluir
              </button>
              <button type="button" className="arc-button arc-button-secondary" disabled={submitting} onClick={() => void changeStatus("faltou")}>
                <UserX size={14} /> Faltou
              </button>
              <button type="button" className="arc-button arc-button-secondary" disabled={submitting} onClick={() => void changeStatus("cancelado")}>
                <X size={14} /> Cancelar horário
              </button>
            </>
          )}

          {(appointment.status === "cancelado" || appointment.status === "faltou") && (
            <button type="button" className="arc-button arc-button-secondary" disabled={submitting} onClick={() => void changeStatus("agendado")}>
              Voltar para agendado
            </button>
          )}
        </div>
      )}

      <fieldset disabled={!editable || submitting} className="agenda-fieldset">
        <div className="arc-field">
          <label htmlFor="appointment-client">Cliente (opcional)</label>
          <select
            id="appointment-client"
            value={form.clientId}
            onChange={event => update("clientId", event.target.value)}
          >
            <option value="">Sem cliente</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.name}{client.phone ? ` · ${client.phone}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="arc-field">
          <label htmlFor="appointment-title">Serviço / assunto</label>
          <input
            id="appointment-title"
            type="text"
            value={form.title}
            onChange={event => update("title", event.target.value)}
            maxLength={120}
            placeholder="Ex.: Consultoria, reunião, instalação..."
          />
        </div>

        <div className="arc-form-grid">
          <div className="arc-field">
            <label htmlFor="appointment-date">Data</label>
            <input
              id="appointment-date"
              type="date"
              value={form.date}
              onChange={event => update("date", event.target.value)}
              required
            />
          </div>

          <div className="arc-field">
            <label htmlFor="appointment-responsible">Responsável</label>
            <select
              id="appointment-responsible"
              value={form.responsibleId}
              onChange={event => update("responsibleId", event.target.value)}
            >
              <option value="">Sem responsável</option>
              {members.map(member => (
                <option key={member.userId} value={member.userId}>{member.name}</option>
              ))}
            </select>
          </div>

          <div className="arc-field">
            <label htmlFor="appointment-start">Início</label>
            <input
              id="appointment-start"
              type="time"
              value={form.startTime}
              step={300}
              onChange={event => {
                const start = event.target.value;
                const duration = minutes(form.endTime) - minutes(form.startTime);
                setConflicts(null);
                setErrorMessage("");
                // Mantém a duração ao mudar o início
                setForm(current => ({
                  ...current,
                  startTime: start,
                  endTime: start ? timeFrom(minutes(start) + (duration > 0 ? duration : 60)) : current.endTime
                }));
              }}
              required
            />
          </div>

          <div className="arc-field">
            <label htmlFor="appointment-end">Término</label>
            <input
              id="appointment-end"
              type="time"
              value={form.endTime}
              step={300}
              onChange={event => update("endTime", event.target.value)}
              required
            />
          </div>

          <div className="arc-field">
            <label htmlFor="appointment-amount">Valor (opcional)</label>
            <CurrencyInput
              id="appointment-amount"
              value={form.amount}
              onChange={value => update("amount", value)}
            />
          </div>

          <div className="arc-field">
            <label htmlFor="appointment-status">Status</label>
            <select
              id="appointment-status"
              value={form.status}
              onChange={event => update("status", event.target.value as AppointmentStatus)}
            >
              {(Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[])
                .filter(status => status !== "concluido" || form.status === "concluido")
                .map(status => (
                  <option key={status} value={status}>{APPOINTMENT_STATUS_LABELS[status]}</option>
                ))}
            </select>
          </div>
        </div>

        <div className="arc-field">
          <label htmlFor="appointment-notes">Observações</label>
          <textarea
            id="appointment-notes"
            value={form.notes}
            onChange={event => update("notes", event.target.value)}
            rows={3}
          />
        </div>
      </fieldset>

      {appointment?.receivable_id && (
        <small className="arc-hint">Já tem conta a receber criada a partir deste atendimento.</small>
      )}

      {errorMessage && <div className="arc-form-error">{errorMessage}</div>}

      {conflicts ? (
        <div className="cash-confirm agenda-conflict" role="alertdialog">
          <strong>
            <AlertTriangle size={16} />
            {nameOf(form.responsibleId)} já tem horário neste período
          </strong>
          <ul>
            {conflicts.map(item => (
              <li key={item.id}>
                {item.start_time}–{item.end_time} · {item.clients?.name ?? item.title ?? "Sem cliente"}
                {item.clients && item.title ? ` · ${item.title}` : ""} ({APPOINTMENT_STATUS_LABELS[item.status]})
              </li>
            ))}
          </ul>
          <div className="cash-confirm-actions">
            <button type="button" className="arc-button arc-button-secondary" onClick={() => setConflicts(null)} disabled={submitting}>
              Voltar e mudar o horário
            </button>
            <button type="button" className="arc-button arc-button-primary" onClick={() => void save(true)} disabled={submitting}>
              {submitting ? "Salvando..." : "Agendar mesmo assim"}
            </button>
          </div>
        </div>
      ) : (
        <div className="arc-form-actions">
          {appointment && canDelete && (
            <button
              type="button"
              className="arc-button arc-button-secondary agenda-delete"
              onClick={() => void handleDelete()}
              disabled={submitting}
            >
              <Trash2 size={14} /> Excluir
            </button>
          )}

          <button type="button" className="arc-button arc-button-secondary" onClick={onCancel} disabled={submitting}>
            {editable ? "Cancelar" : "Fechar"}
          </button>

          {editable && (
            <button type="submit" className="arc-button arc-button-primary" disabled={submitting}>
              {submitting ? "Salvando..." : appointment ? "Salvar alterações" : "Agendar"}
            </button>
          )}
        </div>
      )}
    </form>
  );
}

export default AppointmentForm;
