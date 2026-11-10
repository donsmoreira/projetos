import { useEffect } from "react";
import { X } from "lucide-react";

import type {
  CreditCard
} from "../../../types/creditCard";

import CreditCardForm from "./CreditCardForm";

type CreditCardModalProps = {
  open: boolean;
  card: CreditCard | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function CreditCardModal({
  open,
  card,
  onClose,
  onSaved
}: CreditCardModalProps) {
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
      className="credit-card-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="credit-card-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-card-modal-title"
      >
        <header className="credit-card-modal-header">
          <div>
            <h2 id="credit-card-modal-title">
              {card
                ? "Editar cartão de crédito"
                : "Novo cartão de crédito"}
            </h2>

            <p>
              Informe os dados do cartão.
            </p>
          </div>

          <button
            type="button"
            className="credit-card-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="credit-card-modal-body">
          <CreditCardForm
            card={card}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default CreditCardModal;