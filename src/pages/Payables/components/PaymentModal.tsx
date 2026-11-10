import {
  useEffect
} from "react";

import {
  X
} from "lucide-react";

import type {
  Payable
} from "../../../types/payable";

import PaymentForm from "./PaymentForm";

type PaymentModalProps = {
  open: boolean;
  payable: Payable | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function PaymentModal({
  open,
  payable,
  onClose,
  onSaved
}: PaymentModalProps) {
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

  if (!open || !payable) {
    return null;
  }

  return (
    <div
      className="payment-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="payment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
      >
        <header className="payment-modal-header">
          <div>
            <h2 id="payment-modal-title">
              Registrar pagamento
            </h2>

            <p>
              Selecione a conta bancária e confirme os dados.
            </p>
          </div>

          <button
            type="button"
            className="payment-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="payment-modal-body">
          <PaymentForm
            payable={payable}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default PaymentModal;