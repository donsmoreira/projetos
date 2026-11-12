import type { Appointment } from "../../types/appointment";

export type AgendaView = "mes" | "semana" | "dia" | "lista";

export const VIEW_LABELS: Record<AgendaView, string> = {
  mes: "Mês",
  semana: "Semana",
  dia: "Dia",
  lista: "Lista"
};

/** Faixa de horas mostrada no dia e na semana */
export const FIRST_HOUR = 6;
export const LAST_HOUR = 22;
export const HOUR_PX = 52;

export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Cores dos responsáveis (na ordem dos usuários) */
const PALETTE = [
  "#1a5cff", "#0f9d74", "#c2410c", "#7c3aed",
  "#db2777", "#0891b2", "#a16207", "#4d7c0f"
];

export function colorFor(index: number): string {
  return index < 0 ? "#64748b" : PALETTE[index % PALETTE.length];
}

export function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "AAAA-MM-DD" → data local (meia-noite) */
export function fromISO(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date): Date {
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -date.getDay());
}

/** Primeiro domingo da grade do mês (6 semanas = 42 dias) */
export function monthGridStart(date: Date): Date {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

/** Período carregado para cada visão */
export function rangeFor(view: AgendaView, cursor: Date): { start: Date; end: Date } {
  switch (view) {
    case "mes": {
      const start = monthGridStart(cursor);
      return { start, end: addDays(start, 41) };
    }
    case "semana": {
      const start = startOfWeek(cursor);
      return { start, end: addDays(start, 6) };
    }
    case "dia":
      return { start: cursor, end: cursor };
    case "lista":
      return { start: cursor, end: addDays(cursor, 30) };
  }
}

/** Avança ou volta uma "página" da visão */
export function shift(view: AgendaView, cursor: Date, direction: 1 | -1): Date {
  switch (view) {
    case "mes":
      return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
    case "semana":
      return addDays(cursor, 7 * direction);
    case "dia":
      return addDays(cursor, direction);
    case "lista":
      return addDays(cursor, 30 * direction);
  }
}

export function titleFor(view: AgendaView, cursor: Date): string {
  if (view === "mes") {
    const text = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  if (view === "dia") {
    const text = cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const { start, end } = rangeFor(view, cursor);
  const from = start.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  const to = end.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
  return view === "lista" ? `De ${from} a ${to}` : `${from} – ${to}`;
}

/** "08:30" → 510 */
export function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + (mins || 0);
}

/** 510 → "08:30" */
export function timeFrom(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export type PositionedAppointment = {
  appointment: Appointment;
  top: number;
  height: number;
  /** Coluna dentro do grupo de horários que se sobrepõem */
  lane: number;
  lanes: number;
};

/**
 * Posição de cada agendamento na linha do tempo de um dia.
 * Horários que se sobrepõem ficam lado a lado.
 */
export function layoutDay(appointments: Appointment[]): PositionedAppointment[] {
  const sorted = [...appointments].sort(
    (a, b) => minutes(a.start_time) - minutes(b.start_time) || minutes(b.end_time) - minutes(a.end_time)
  );

  const result: PositionedAppointment[] = [];
  let cluster: PositionedAppointment[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const item of cluster) {
      item.lanes = laneEnds.length;
    }
    cluster = [];
    laneEnds = [];
  };

  for (const appointment of sorted) {
    const start = minutes(appointment.start_time);
    const end = Math.max(minutes(appointment.end_time), start + 15);

    if (start >= clusterEnd) {
      closeCluster();
      clusterEnd = end;
    } else {
      clusterEnd = Math.max(clusterEnd, end);
    }

    let lane = laneEnds.findIndex(laneEnd => laneEnd <= start);

    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    const visibleStart = Math.max(start, FIRST_HOUR * 60);
    const visibleEnd = Math.min(end, LAST_HOUR * 60);

    const item: PositionedAppointment = {
      appointment,
      top: ((visibleStart - FIRST_HOUR * 60) / 60) * HOUR_PX,
      height: Math.max(((visibleEnd - visibleStart) / 60) * HOUR_PX, 20),
      lane,
      lanes: 1
    };

    cluster.push(item);
    result.push(item);
  }

  closeCluster();
  return result;
}

export function formatMoney(value: number | null): string {
  if (value === null) {
    return "";
  }

  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
