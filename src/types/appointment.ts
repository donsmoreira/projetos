export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "concluido"
  | "cancelado"
  | "faltou";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou"
};

/** Status que ocupam o horário (contam para conflito) */
export const BUSY_STATUSES: AppointmentStatus[] = ["agendado", "confirmado", "concluido"];

export interface Appointment {
  id: string;
  /** Opcional: compromisso sem cliente */
  client_id: string | null;
  /** Serviço ou assunto */
  title: string;
  /** "AAAA-MM-DD" */
  appointment_date: string;
  /** "HH:MM" */
  start_time: string;
  /** "HH:MM" */
  end_time: string;
  amount: number | null;
  responsible_id: string | null;
  status: AppointmentStatus;
  notes: string | null;
  receivable_id: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  clients: { id: string; name: string; phone: string | null } | null;
}

export interface AppointmentFormData {
  clientId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  amount: number;
  responsibleId: string;
  status: AppointmentStatus;
  notes: string;
}
