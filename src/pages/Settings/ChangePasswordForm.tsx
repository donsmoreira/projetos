import { useState } from "react";
import type { FormEvent } from "react";

import { Eye, EyeOff, KeyRound } from "lucide-react";

import { changeMyPassword } from "../../services/passwordService";
import { MIN_PASSWORD_LENGTH } from "../../utils/authErrors";

type Field = "current" | "next" | "confirm";

const LABELS: Record<Field, string> = {
  current: "Senha atual",
  next: "Nova senha",
  confirm: "Confirmação da nova senha"
};

const AUTOCOMPLETE: Record<Field, string> = {
  current: "current-password",
  next: "new-password",
  confirm: "new-password"
};

/** Meu perfil → Alterar senha (só para quem já está logado; esqueci a senha é outra tela). */
function ChangePasswordForm() {
  const [values, setValues] = useState<Record<Field, string>>({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  function update(field: Field, value: string) {
    setErrorMessage("");
    setSavedMessage("");
    setValues(current => ({ ...current, [field]: value }));
  }

  const mismatch = values.confirm.length > 0 && values.confirm !== values.next;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setErrorMessage("");
      setSavedMessage("");
      await changeMyPassword(values.current, values.next, values.confirm);
      setValues({ current: "", next: "", confirm: "" });
      setSavedMessage("Senha alterada. Use a nova senha no próximo login.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="settings-card" autoComplete="on">
      <h3><KeyRound size={17} /> Alterar senha</h3>

      <div className="settings-grid">
        {(Object.keys(LABELS) as Field[]).map(field => (
          <div key={field} className={`settings-field${field === "current" ? " settings-field-full" : ""}`}>
            <label htmlFor={`password-${field}`}>{LABELS[field]}</label>
            <input
              id={`password-${field}`}
              type={show ? "text" : "password"}
              value={values[field]}
              onChange={event => update(field, event.target.value)}
              autoComplete={AUTOCOMPLETE[field]}
              required
            />
            {field === "next" && <small>Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</small>}
            {field === "confirm" && mismatch && (
              <small className="settings-field-error">A confirmação não é igual à nova senha.</small>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="settings-password-toggle" onClick={() => setShow(current => !current)}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
        {show ? "Esconder senhas" : "Mostrar senhas"}
      </button>

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
      {savedMessage && <div className="settings-message settings-message-ok">{savedMessage}</div>}

      <div className="settings-actions">
        <button
          type="submit"
          className="settings-button"
          disabled={saving || !values.current || !values.next || !values.confirm || mismatch}
        >
          {saving ? "Alterando..." : "Alterar senha"}
        </button>
      </div>
    </form>
  );
}

export default ChangePasswordForm;
