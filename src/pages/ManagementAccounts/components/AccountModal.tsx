import {
  useEffect
} from "react";

import {
  X
} from "lucide-react";

import type {
  ManagementAccount
} from "../../../types/managementAccount";

import { getAccountPath } from "../../../utils/accountTree";

import AccountForm from "./AccountForm";

type AccountModalProps = {
  open: boolean;
  account: ManagementAccount | null;
  defaultParentId: string | null;
  accounts: ManagementAccount[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function AccountModal({
  open,
  account,
  defaultParentId,
  accounts,
  onClose,
  onSaved
}: AccountModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const title = account
    ? "Editar conta"
    : defaultParentId
      ? "Nova subconta"
      : "Nova conta";

  const subtitle = !account && defaultParentId
    ? `Dentro de: ${getAccountPath(accounts, defaultParentId)}`
    : "Conta gerencial de receita ou despesa.";

  return (
    <div
      className="account-modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
      >
        <header className="account-modal-header">
          <div>
            <h2 id="account-modal-title">
              {title}
            </h2>

            <p>{subtitle}</p>
          </div>

          <button
            type="button"
            className="account-modal-close"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="account-modal-body">
          <AccountForm
            key={`${account?.id ?? "nova"}-${defaultParentId ?? "raiz"}`}
            account={account}
            defaultParentId={defaultParentId}
            accounts={accounts}
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  );
}

export default AccountModal;
