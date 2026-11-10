import {
  useEffect
} from "react";

import {
  X
} from "lucide-react";

import type {
  Client
} from "../../../types/client";

import ClientForm from "./ClientForm";

type ClientModalProps = {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function ClientModal({
  open,
  client,
  onClose,
  onSaved
}: ClientModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="client-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="client-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-modal-title"
      >
        <header className="client-modal-header">
          <div>
            <h2 id="client-modal-title">
              {client
                ? "Editar cliente"
                : "Novo cliente"}
            </h2>

            <p>
              Informe os dados do cliente.
            </p>
          </div>

          <button
            type="button"
            className="client-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="client-modal-body">
          <ClientForm
            client={client}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default ClientModal;