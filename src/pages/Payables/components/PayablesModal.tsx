import {
  useEffect
} from "react";

import {
  X
} from "lucide-react";

import type {
  Payable
} from "../../../types/payable";

import PayableForm from "./PayablesForm";

type PayableModalProps = {
  open: boolean;
  payable: Payable | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function PayableModal({
  open,
  payable,
  onClose,
  onSaved
}: PayableModalProps) {
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
      className="payable-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="payable-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payable-modal-title"
      >
        <header className="payable-modal-header">
          <div>
            <h2 id="payable-modal-title">
              {payable
                ? "Editar conta a pagar"
                : "Nova conta a pagar"}
            </h2>

            <p>
              Informe os dados da despesa.
            </p>
          </div>

          <button
            type="button"
            className="payable-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="payable-modal-body">
          <PayableForm
            payable={payable}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default PayableModal;