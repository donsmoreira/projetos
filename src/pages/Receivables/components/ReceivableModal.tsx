import { useEffect } from "react";
import { X } from "lucide-react";

import type {
  Receivable
} from "../../../types/receivable";

import ReceivableForm from "./ReceivableForm";

type ReceivableModalProps = {
  open: boolean;
  receivable: Receivable | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function ReceivableModal({
  open,
  receivable,
  onClose,
  onSaved
}: ReceivableModalProps) {
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
      className="receivable-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="receivable-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receivable-modal-title"
      >
        <header className="receivable-modal-header">
          <div>
            <h2 id="receivable-modal-title">
              {receivable
                ? "Editar conta a receber"
                : "Nova conta a receber"}
            </h2>

            <p>
              Informe os dados da receita.
            </p>
          </div>

          <button
            type="button"
            className="receivable-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="receivable-modal-body">
          <ReceivableForm
            receivable={receivable}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default ReceivableModal;