import {
  useEffect
} from "react";

import {
  X
} from "lucide-react";

import type {
  BankAccount
} from "../../../types/bankAccount";

import BankAccountForm from "./BankAccountForm";

type BankAccountModalProps = {
  open: boolean;
  account: BankAccount | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function BankAccountModal({
  open,
  account,
  onClose,
  onSaved
}: BankAccountModalProps) {
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
      className="bank-account-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="bank-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-account-modal-title"
      >
        <header className="bank-account-modal-header">
          <div>
            <h2 id="bank-account-modal-title">
              {account
                ? "Editar conta bancária"
                : "Nova conta bancária"}
            </h2>

            <p>
              Informe os dados da conta.
            </p>
          </div>

          <button
            type="button"
            className="bank-account-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="bank-account-modal-body">
          <BankAccountForm
            account={account}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default BankAccountModal;