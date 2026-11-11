import { useState } from "react";

import { updateMemberName } from "../../services/companyService";

import type { CompanyMember } from "../../types/company";

type MemberNameFieldProps = {
  member: CompanyMember;
  onDone: (message: string) => Promise<void>;
};

/** Administrador: editar o nome do usuário. O e-mail de acesso aparece só para consulta. */
function MemberNameField({ member, onDone }: MemberNameFieldProps) {
  const [name, setName] = useState(member.fullName);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const changed = name.trim() !== member.fullName.trim();

  async function handleSave() {
    if (!name.trim()) {
      setErrorMessage("Informe o nome.");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      await updateMemberName(member.userId, name);
      await onDone("Nome do usuário salvo.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar o nome.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-account-tool">
      <strong>Dados do usuário</strong>

      <div className="settings-inline-form">
        <div className="settings-field">
          <label htmlFor={`name-${member.userId}`}>Nome</label>
          <input
            id={`name-${member.userId}`}
            type="text"
            value={name}
            maxLength={120}
            onChange={event => setName(event.target.value)}
          />
        </div>

        <div className="settings-field">
          <label htmlFor={`email-${member.userId}`}>E-mail de acesso</label>
          <input id={`email-${member.userId}`} type="email" value={member.email} disabled />
        </div>

        {changed && (
          <button
            type="button"
            className="settings-button"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Salvando..." : "Salvar nome"}
          </button>
        )}
      </div>

      <small>O e-mail é o login da pessoa e não muda por aqui.</small>

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
    </div>
  );
}

export default MemberNameField;
