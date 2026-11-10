import {
  useEffect
} from "react";

import {
  X
} from "lucide-react";

import type {
  Supplier
} from "../../../types/supplier";

import SupplierForm from "./SupplierForm";

type SupplierModalProps = {
  open: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function SupplierModal({
  open,
  supplier,
  onClose,
  onSaved
}: SupplierModalProps) {
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
      className="supplier-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="supplier-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-modal-title"
      >
        <header className="supplier-modal-header">
          <div>
            <h2 id="supplier-modal-title">
              {supplier
                ? "Editar fornecedor"
                : "Novo fornecedor"}
            </h2>

            <p>
              Informe os dados do fornecedor.
            </p>
          </div>

          <button
            type="button"
            className="supplier-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="supplier-modal-body">
          <SupplierForm
            supplier={supplier}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default SupplierModal;