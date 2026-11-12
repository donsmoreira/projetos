import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { Appointment } from "../../types/appointment";
import { FIRST_HOUR, HOUR_PX, minutes } from "./agendaUtils";
import { DragGhost } from "./dragGhost";

/** Onde o agendamento vai cair (para desenhar o destaque/sombra) */
export type DragPreview = {
  appointmentId: string;
  /** "AAAA-MM-DD" do dia sob o dedo/mouse */
  targetDate: string | null;
  /** Início em minutos (só na semana/dia) */
  targetStart: number | null;
  duration: number;
};

type Pending = {
  appointment: Appointment;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  /** Distância (px) entre o topo do agendamento e onde a pessoa pegou */
  grabOffsetPx: number;
  active: boolean;
  timer: number | undefined;
  /** Elemento original (para copiar o visual e saber de onde saiu) */
  source: HTMLElement;
  ghost: DragGhost | null;
};

const MOUSE_THRESHOLD = 5;
const TOUCH_CANCEL = 8;
const LONG_PRESS_MS = 350;
const SNAP = 15;

/**
 * Arrastar agendamentos com mouse ou dedo.
 * - Mouse: começa a arrastar depois de mover alguns pixels.
 * - Toque: precisa segurar um instante (senão é rolagem normal da tela).
 * Os elementos de destino têm data-drop-date="AAAA-MM-DD"; as colunas da
 * linha do tempo também têm data-drop-grid para calcular o horário.
 */
export function useAppointmentDrag(
  enabled: boolean,
  onDrop: (appointment: Appointment, date: string, startMinutes: number | null) => void
) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const pending = useRef<Pending | null>(null);
  const justDragged = useRef(false);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const target = useCallback((clientX: number, clientY: number, state: Pending) => {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-drop-date]");
    const duration = Math.max(minutes(state.appointment.end_time) - minutes(state.appointment.start_time), SNAP);

    if (!element) {
      return { date: null, start: null, duration };
    }

    const date = element.dataset.dropDate ?? null;

    if (element.dataset.dropGrid === undefined) {
      return { date, start: null, duration };
    }

    const rect = element.getBoundingClientRect();
    const offsetY = clientY - rect.top - state.grabOffsetPx;
    const raw = FIRST_HOUR * 60 + (offsetY / HOUR_PX) * 60;
    const snapped = Math.round(raw / SNAP) * SNAP;
    const start = Math.max(0, Math.min(24 * 60 - duration, snapped));

    return { date, start, duration };
  }, []);

  const finish = useCallback(() => {
    const state = pending.current;

    if (state?.timer) {
      window.clearTimeout(state.timer);
    }

    // Cancelado (ou sem destino tratado antes): o cartão some
    state?.ghost?.remove(120);

    pending.current = null;
    setPreview(null);
    document.body.classList.remove("agenda-dragging");
  }, []);

  useEffect(() => {
    function activate(state: Pending, x: number, y: number) {
      state.active = true;
      state.ghost = new DragGhost(state.source, x, y);
      document.body.classList.add("agenda-dragging");
      navigator.vibrate?.(15);
    }

    function handleMove(event: PointerEvent) {
      const state = pending.current;

      if (!state || event.pointerId !== state.pointerId) {
        return;
      }

      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);

      if (!state.active) {
        if (state.pointerType === "mouse") {
          if (distance < MOUSE_THRESHOLD) {
            return;
          }
          activate(state, event.clientX, event.clientY);
        } else {
          // Dedo mexeu antes de segurar: é rolagem, não arrasto
          if (distance > TOUCH_CANCEL) {
            finish();
          }
          return;
        }
      }

      state.ghost?.move(event.clientX, event.clientY);

      const found = target(event.clientX, event.clientY, state);
      setPreview({
        appointmentId: state.appointment.id,
        targetDate: found.date,
        targetStart: found.start,
        duration: found.duration
      });
    }

    function handleUp(event: PointerEvent) {
      const state = pending.current;

      if (!state || event.pointerId !== state.pointerId) {
        return;
      }

      if (state.active) {
        const found = target(event.clientX, event.clientY, state);
        justDragged.current = true;
        window.setTimeout(() => {
          justDragged.current = false;
        }, 0);

        // O cartão vai até onde caiu (a sombra do horário, ou o dia no mês) e assenta
        let landing: DOMRect | null = null;

        if (found.date) {
          const shadow = document.querySelector<HTMLElement>(".agenda-drop-ghost");
          const cell = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>("[data-drop-date]");

          if (shadow) {
            landing = shadow.getBoundingClientRect();
          } else if (cell) {
            const rect = cell.getBoundingClientRect();
            landing = new DOMRect(rect.left + 4, rect.top + 34, rect.width - 8, 22);
          }
        }

        state.ghost?.land(landing, state.source.getBoundingClientRect());
        state.ghost = null;

        if (found.date) {
          onDropRef.current(state.appointment, found.date, found.start);
        }
      }

      finish();
    }

    // Enquanto arrasta com o dedo, a tela não rola
    function handleTouchMove(event: TouchEvent) {
      if (pending.current?.active) {
        event.preventDefault();
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [finish, target]);

  /** Ligar no onPointerDown do agendamento */
  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>, appointment: Appointment) => {
    if (!enabled || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    const state: Pending = {
      appointment,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetPx: event.clientY - rect.top,
      active: false,
      timer: undefined,
      source: event.currentTarget,
      ghost: null
    };

    if (event.pointerType !== "mouse") {
      // Toque: segura um instante para começar a arrastar
      state.timer = window.setTimeout(() => {
        if (pending.current === state) {
          state.active = true;
          state.ghost = new DragGhost(state.source, state.startX, state.startY);
          document.body.classList.add("agenda-dragging");
          navigator.vibrate?.(15);
          setPreview({
            appointmentId: appointment.id,
            targetDate: appointment.appointment_date,
            targetStart: minutes(appointment.start_time),
            duration: minutes(appointment.end_time) - minutes(appointment.start_time)
          });
        }
      }, LONG_PRESS_MS);
    }

    pending.current = state;
  }, [enabled]);

  /** No onClick: true se o clique foi o fim de um arrasto (não abre o agendamento) */
  const consumeClick = useCallback(() => justDragged.current, []);

  return { preview, startDrag, consumeClick };
}
