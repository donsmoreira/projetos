import {
  useEffect,
  useRef
} from "react";

import type {
  ReactNode
} from "react";

import { X } from "lucide-react";

import "./Modal.css";

type ModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
};

/**
 * Janela por cima da tela, fecha com Esc, no X ou clicando fora.
 */
function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = 560
}: ModalProps) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="arc-modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="arc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: `${width}px` }}
      >
        <header className="arc-modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <button
            type="button"
            className="arc-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="arc-modal-body">
          {children}
        </div>
      </section>
    </div>
  );
}

export default Modal;
