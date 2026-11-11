import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

type Box = { top: number; left: number; width: number; height: number };

/** Tempo da primeira fase (estica até cobrir os dois itens) */
const STRETCH_MS = 90;

/** Tempo da segunda fase (encolhe no item novo, com o quique) */
const SETTLE_MS = 200;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Pílula azul atrás do item selecionado do menu.
 * Ao trocar de tela ela estica do item antigo até o novo (cobrindo os dois)
 * e depois encolhe no novo, como a chave de claro/escuro.
 * Mexe direto no estilo do elemento (sem re-render do React).
 */
export function useSlidingIndicator(
  navRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  /** Qualquer coisa que mude a posição do item ativo */
  deps: unknown[]
) {
  const previous = useRef<Box | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;

    if (!nav || !indicator) {
      return;
    }

    const place = (box: Box, transition: string) => {
      indicator.style.transition = transition;
      indicator.style.transform = `translate(${box.left}px, ${box.top}px)`;
      indicator.style.width = `${box.width}px`;
      indicator.style.height = `${box.height}px`;
    };

    const measure = (): Box | null => {
      const active = nav.querySelector<HTMLElement>(".sidebar-item.active");

      // Item dentro de grupo fechado (ou nenhum): sem pílula
      if (!active || active.offsetParent === null) {
        return null;
      }

      const navRect = nav.getBoundingClientRect();
      const rect = active.getBoundingClientRect();

      return {
        top: rect.top - navRect.top,
        left: rect.left - navRect.left,
        width: rect.width,
        height: rect.height
      };
    };

    const update = (animate: boolean) => {
      window.clearTimeout(timer.current);

      const next = measure();

      if (!next) {
        indicator.style.opacity = "0";
        previous.current = null;
        return;
      }

      const from = previous.current;
      previous.current = next;
      indicator.style.opacity = "1";

      const moved = from && (from.top !== next.top || from.left !== next.left);

      if (!animate || !from || !moved || prefersReducedMotion()) {
        place(next, "none");
        return;
      }

      // 1) estica: cobre do item antigo até o novo
      const top = Math.min(from.top, next.top);
      const bottom = Math.max(from.top + from.height, next.top + next.height);

      place(
        { top, left: next.left, width: next.width, height: bottom - top },
        `transform ${STRETCH_MS}ms cubic-bezier(0.4, 0, 0.6, 1), height ${STRETCH_MS}ms cubic-bezier(0.4, 0, 0.6, 1), width ${STRETCH_MS}ms ease`
      );

      // 2) encolhe no item novo, com um leve "quique" plástico
      timer.current = window.setTimeout(() => {
        place(
          next,
          `transform ${SETTLE_MS}ms cubic-bezier(0.34, 1.3, 0.5, 1), height ${SETTLE_MS}ms cubic-bezier(0.34, 1.3, 0.5, 1), width ${SETTLE_MS}ms ease`
        );
      }, STRETCH_MS);
    };

    update(true);

    // Menu recolhido, gaveta, janela mudando de tamanho: só reposiciona
    // (a primeira chamada vem logo ao observar: ignora para não cortar a animação)
    let firstCall = true;
    const observer = new ResizeObserver(() => {
      if (firstCall) {
        firstCall = false;
        return;
      }

      update(false);
    });
    observer.observe(nav);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
