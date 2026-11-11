import { useState } from "react";
import type { FormEvent } from "react";

import { UserPlus } from "lucide-react";

import { useCompany } from "../../hooks/useCompany";
import { createUsernameUser } from "../../services/userAdminService";
import { modulePermissionsWith } from "../../types/permissions";
import { normalizeUsername, validateUsername } from "../../utils/username";

import type { CompanyPermissions } from "../../types/company";

import CompanyChecklist from "./CompanyChecklist";
import PermissionMatrix from "./PermissionMatrix";

type NewUserFormProps = {
  onCreated: (message: string) => Promise<void>;
};

/** Cadastrar usuário com nome de usuário e senha (sem e-mail). */
function NewUserForm({ onCreated }: NewUserFormProps) {
  const { companies, active } = useCompany();
  const adminCompanies = companies.filter(item => item.permissions.isAdmin);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>(active ? [active.company.id] : []);
  const [permissions, setPermissions] = useState<CompanyPermissions>(() => ({
    isAdmin: false,
    modules: modulePermissionsWith(["view", "create", "update", "settle"])
  }));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim()) {
      setErrorMessage("Informe o nome da pessoa.");
      return;
    }

    const usernameError = validateUsername(username);

    if (usernameError) {
      setErrorMessage(usernameError);
      return;
    }

    if (password.length < 8) {
      setErrorMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirm) {
      setErrorMessage("A confirmação não é igual à senha.");
      return;
    }

    if (companyIds.length === 0) {
      setErrorMessage("Marque pelo menos uma empresa.");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");

      await createUsernameUser({ fullName, username, password, companyIds, permissions });

      const login = normalizeUsername(username);
      setFullName("");
      setUsername("");
      setPassword("");
      setConfirm("");

      await onCreated(
        `Usuário "${login}" cadastrado. Ele entra digitando "${login}" e a senha no campo "E-mail ou usuário".`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível cadastrar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-card" onSubmit={handleSubmit}>
      <h3>Cadastrar usuário</h3>
      <p>
        Crie o acesso com nome de usuário e senha, sem e-mail. No login a pessoa digita o
        usuário no lugar do e-mail. Marque as empresas em que ela vai operar: as permissões
        abaixo valem para todas as marcadas (depois dá para ajustar em cada empresa).
      </p>

      <div className="settings-grid">
        <div className="settings-field settings-field-full">
          <label htmlFor="new-user-name">Nome da pessoa</label>
          <input
            id="new-user-name"
            type="text"
            value={fullName}
            onChange={event => setFullName(event.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="settings-field settings-field-full">
          <label htmlFor="new-user-login">Usuário (para entrar no sistema)</label>
          <input
            id="new-user-login"
            type="text"
            value={username}
            onChange={event => setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            placeholder="ex.: joao.silva"
          />
          <small>Letras minúsculas sem acento, números, ponto, hífen ou sublinhado.</small>
        </div>

        <div className="settings-field">
          <label htmlFor="new-user-password">Senha</label>
          <input
            id="new-user-password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <small>Pelo menos 8 caracteres.</small>
        </div>

        <div className="settings-field">
          <label htmlFor="new-user-confirm">Confirmar senha</label>
          <input
            id="new-user-confirm"
            type="password"
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="settings-field settings-field-full">
          <label>Empresas em que vai operar</label>
          <CompanyChecklist
            companies={adminCompanies}
            selected={companyIds}
            onChange={setCompanyIds}
            disabled={saving}
          />
          <small>Aparecem só as empresas de que você é administrador.</small>
        </div>
      </div>

      <PermissionMatrix
        idPrefix="new-user"
        value={permissions}
        disabled={saving}
        onChange={setPermissions}
      />

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}

      <div className="settings-actions" style={{ justifyContent: "flex-start" }}>
        <button type="submit" className="settings-button" disabled={saving}>
          <UserPlus size={15} />
          {saving ? "Cadastrando..." : "Cadastrar usuário"}
        </button>
      </div>
    </form>
  );
}

export default NewUserForm;
