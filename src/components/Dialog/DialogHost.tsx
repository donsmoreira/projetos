import { useEffect, useRef, useState } from "react";

import { AlertTriangle, HelpCircle, Info, Trash2 } from "lucide-react";

import { answerDialog, subscribeDialog } from "./dialog";
import type { DialogRequest } from "./dialog";

import "../Modal/Modal.css";
import "./Dialog.css";

/** Mostra a janela de aviso/confirmação da vez. Fica montado uma vez só, na raiz do app. */
function DialogHost() {
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeDialog(setCurrent), []);

  useEffect(() => {
    if (!current) {
      return;
    }

    const id = current.id;
    const previousFocus = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        answerDialog(id, false);
      }
    }

    // Captura para o Esc não fechar também a janela de trás
    document.addEventListener("keydown", handleKeyDown, true);
    confirmRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previousFocus?.focus?.();
    };
  }, [current]);

  if (!current) {
    return null;
  }

  const isConfirm = current.kind === "confirm";

  const Icon = current.tone === "danger"
    ? (current.confirmLabel === "Excluir" ? Trash2 : AlertTriangle)
    : current.tone === "info"
      ? Info
      : isConfirm ? HelpCircle : AlertTriangle;

  return (
    <div
      className="app-dialog-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          answerDialog(current.id, false);
        }
      }}
    >
      <section
        className={`app-dialog is-${current.tone}`}
        role={isConfirm ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
      >
        <div className="app-dialog-icon" aria-hidden="true">
          <Icon size={22} />
        </div>

        <div className="app-dialog-content">
          <h2 id="app-dialog-title">{current.title}</h2>
          <p id="app-dialog-message">{current.message}</p>
        </div>

        <div className="app-dialog-actions">
          {isConfirm && (
            <button
              type="button"
              className="arc-button arc-button-secondary"
              onClick={() => answerDialog(current.id, false)}
            >
              {current.cancelLabel}
            </button>
          )}

          <button
            ref={confirmRef}
            type="button"
            className={`arc-button ${isConfirm && current.tone === "danger" ? "app-dialog-danger" : "arc-button-primary"}`}
            onClick={() => answerDialog(current.id, true)}
          >
            {current.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default DialogHost;
