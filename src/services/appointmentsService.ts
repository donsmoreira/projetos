import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

import { BUSY_STATUSES, DEFAULT_APPOINTMENT_COLOR } from "../types/appointment";
import type {
  Appointment,
  AppointmentFormData,
  AppointmentStatus
} from "../types/appointment";

const SELECT = "*, clients (id, name, phone)";

function fail(error: { message: string }): never {
  throw new Error(translateCompanyError(error.message));
}

/** "08:00:00" → "08:00" */
function hhmm(value: unknown): string {
  return String(value ?? "").slice(0, 5);
}

function normalize(row: Record<string, unknown>): Appointment {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;

  return {
    ...(row as unknown as Appointment),
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
    all_day: row.all_day === true,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    color: typeof row.color === "string" && row.color ? row.color : DEFAULT_APPOINTMENT_COLOR,
    clients: (client ?? null) as Appointment["clients"]
  };
}

function toRow(form: AppointmentFormData) {
  return {
    client_id: form.clientId || null,
    title: form.title.trim(),
    appointment_date: form.date,
    start_time: form.allDay ? "00:00" : form.startTime,
    end_time: form.allDay ? "23:59" : form.endTime,
    all_day: form.allDay,
    amount: form.amount > 0 ? form.amount : null,
    color: form.color || DEFAULT_APPOINTMENT_COLOR,
    responsible_id: form.responsibleId || null,
    status: form.status,
    notes: form.notes.trim() || null
  };
}

/** Agendamentos entre duas datas (inclusive), de todos os responsáveis. */
export async function listAppointments(startDate: string, endDate: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT)
    .gte("appointment_date", startDate)
    .lte("appointment_date", endDate)
    .order("appointment_date", { ascending: true })
    .order("all_day", { ascending: false })
    .order("start_time", { ascending: true });

  if (error) {
    fail(error);
  }

  return (data ?? []).map(normalize);
}

/**
 * Horários do mesmo responsável que se sobrepõem a este
 * (ignora cancelados e faltas, e o próprio agendamento ao editar).
 */
export async function findConflicts(form: AppointmentFormData, excludeId?: string): Promise<Appointment[]> {
  // Dia inteiro não ocupa horário (igual ao Google Agenda)
  if (!form.responsibleId || form.allDay) {
    return [];
  }

  let query = supabase
    .from("appointments")
    .select(SELECT)
    .eq("responsible_id", form.responsibleId)
    .eq("appointment_date", form.date)
    .eq("all_day", false)
    .in("status", BUSY_STATUSES)
    .lt("start_time", form.endTime)
    .gt("end_time", form.startTime);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;

  if (error) {
    fail(error);
  }

  return (data ?? []).map(normalize);
}

export async function createAppointment(form: AppointmentFormData): Promise<Appointment> {
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      ...toRow(form),
      confirmed_at: form.status === "confirmado" ? new Date().toISOString() : null
    })
    .select(SELECT)
    .single();

  if (error) {
    fail(error);
  }

  return normalize(data);
}

export async function updateAppointment(id: string, form: AppointmentFormData): Promise<Appointment> {
  const { data, error } = await supabase
    .from("appointments")
    .update({ ...toRow(form), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) {
    fail(error);
  }

  return normalize(data);
}

/** Muda só o status (confirmar, concluir, faltou, cancelar, voltar para agendado). */
export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  receivableId?: string | null
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("appointments")
    .update({
      status,
      updated_at: now,
      ...(status === "confirmado" ? { confirmed_at: now } : {}),
      ...(status === "concluido" ? { completed_at: now } : {}),
      ...(status === "cancelado" ? { canceled_at: now } : {}),
      ...(receivableId ? { receivable_id: receivableId } : {})
    })
    .eq("id", id);

  if (error) {
    fail(error);
  }
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id);

  if (error) {
    fail(error);
  }
}
