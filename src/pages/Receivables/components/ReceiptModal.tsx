import { useEffect } from "react";
import { X } from "lucide-react";

import type {
  Receivable
} from "../../../types/receivable";

import ReceiptForm from "./ReceiptForm";

type ReceiptModalProps = {
  open: boolean;
  receivable: Receivable | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function ReceiptModal({
  open,
  receivable,
  onClose,
  onSaved
}: ReceiptModalProps) {
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

  if (!open || !receivable) {
    return null;
  }

  return (
    <div
      className="receipt-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
      >
        <header className="receipt-modal-header">
          <div>
            <h2 id="receipt-modal-title">
              Registrar recebimento
            </h2>

            <p>
              Selecione a conta bancária e confirme os dados.
            </p>
          </div>

          <button
            type="button"
            className="receipt-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="receipt-modal-body">
          <ReceiptForm
            receivable={receivable}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default ReceiptModal;