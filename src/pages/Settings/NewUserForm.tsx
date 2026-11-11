import { useState } from "react";
import type { FormEvent } from "react";

import { UserPlus } from "lucide-react";

import { useCompany } from "../../hooks/useCompany";
import { createCompanyUser } from "../../services/userAdminService";
import { modulePermissionsWith } from "../../types/permissions";

const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

import type { CompanyPermissions } from "../../types/company";

import CompanyChecklist from "./CompanyChecklist";
import PermissionMatrix from "./PermissionMatrix";

type NewUserFormProps = {
  onCreated: (message: string) => Promise<void>;
  /** Fecha o formulário sem cadastrar */
  onCancel: () => void;
};

/** Cadastrar usuário (e-mail e senha) nas empresas do ID EMPRESA aberto. */
function NewUserForm({ onCreated, onCancel }: NewUserFormProps) {
  const { companies, active, groupId } = useCompany();
  const adminCompanies = companies.filter(item => item.permissions.isAdmin);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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

    if (!EMAIL_RULE.test(email.trim())) {
      setErrorMessage("Informe um e-mail válido.");
      return;
    }

    if (password && password.length < 8) {
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

      const existing = await createCompanyUser({ fullName, email, password, companyIds, permissions });

      const login = email.trim().toLowerCase();
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirm("");

      await onCreated(
        existing
          ? `O e-mail ${login} já tinha conta: ele foi incluído nas empresas marcadas e continua com a senha dele. Ele entra com ID EMPRESA ${groupId}, o e-mail e a senha.`
          : `Usuário ${login} cadastrado. Ele entra com ID EMPRESA ${groupId}, o e-mail e a senha que você definiu.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível cadastrar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-card" onSubmit={handleSubmit}>
      <h3>Novo usuário</h3>
      <p>
        Crie o acesso da pessoa com e-mail e senha. Ela entra com o ID EMPRESA {groupId},
        o e-mail e a senha. Marque as empresas em que ela vai operar: as permissões abaixo
        valem para todas as marcadas (depois dá para ajustar em cada empresa). Se o e-mail
        já tiver conta, ela só é incluída nas empresas e continua com a senha dela.
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
          <label htmlFor="new-user-email">E-mail (para entrar no sistema)</label>
          <input
            id="new-user-email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
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
          <small>Pelo menos 8 caracteres. Pode ficar em branco se o e-mail já tiver conta.</small>
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
          <small>Aparecem só as empresas deste ID de que você é administrador.</small>
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

        <button
          type="button"
          className="settings-button settings-button-secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default NewUserForm;
