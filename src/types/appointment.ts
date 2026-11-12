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

/** Cor padrão do agendamento (azul ARC) */
export const DEFAULT_APPOINTMENT_COLOR = "#1a5cff";

/** Cores para escolher no agendamento */
export const APPOINTMENT_COLORS: { name: string; value: string }[] = [
  { name: "Azul", value: "#1a5cff" },
  { name: "Azul-claro", value: "#039be5" },
  { name: "Lilás", value: "#7986cb" },
  { name: "Roxo", value: "#8e24aa" },
  { name: "Rosa", value: "#e67c73" },
  { name: "Vermelho", value: "#d93025" },
  { name: "Laranja", value: "#f4511e" },
  { name: "Amarelo", value: "#f6bf26" },
  { name: "Verde-claro", value: "#33b679" },
  { name: "Verde", value: "#0b8043" },
  { name: "Cinza", value: "#616161" }
];

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
  /** Cor do agendamento ("#rrggbb"); azul por padrão */
  color: string;
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
  color: string;
  responsibleId: string;
  status: AppointmentStatus;
  notes: string;
}
