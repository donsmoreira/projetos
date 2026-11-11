import { useState } from "react";
import type { FormEvent } from "react";

import { Building2, Plus } from "lucide-react";

import { useCompany } from "../../hooks/useCompany";
import { acceptInvite, createCompany } from "../../services/companyService";
import { formatDocument } from "../../utils/document";

import "./Settings.css";

/** Configurações → Empresas: abrir outra empresa, criar uma nova ou entrar com código. */
function CompaniesSettings() {
  const { companies, active, canCreateCompany, switchCompany } = useCompany();

  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function run(key: string, action: () => Promise<unknown>) {
    try {
      setBusy(key);
      setErrorMessage("");
      await action();
      window.location.assign("/");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível concluir.");
      setBusy("");
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newName.trim()) {
      setErrorMessage("Informe o nome da nova empresa.");
      return;
    }

    void run("create", () => createCompany(newName.trim()));
  }

  function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (code.trim().length < 6) {
      setErrorMessage("Digite o código de convite.");
      return;
    }

    void run("code", () => acceptInvite(code));
  }

  return (
    <div className="settings-page">
      <section className="settings-header">
        <div>
          <h2>Empresas</h2>
          <p>As empresas de que você participa. Cada uma tem seus próprios dados.</p>
        </div>
      </section>

      <section className="settings-card">
        <h3>Suas empresas</h3>

        <ul className="settings-company-list">
          {companies.map(item => {
            const isActive = item.company.id === active?.company.id;

            return (
              <li key={item.company.id} className={isActive ? "is-active" : ""}>
                <span>
                  <strong>
                    <Building2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                    {item.company.trade_name || item.company.name}
                  </strong>
                  <small>
                    {item.company.document ? `${formatDocument(item.company.document)} · ` : ""}
                    {item.permissions.isAdmin ? "Administrador" : "Usuário"}
                  </small>
                </span>

                {isActive ? (
                  <span className="settings-badge">Aberta</span>
                ) : (
                  <button
                    type="button"
                    className="settings-button settings-button-secondary settings-button-small"
                    disabled={Boolean(busy)}
                    onClick={() => void run(`open-${item.company.id}`, () => switchCompany(item.company.id))}
                  >
                    Abrir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {canCreateCompany ? (
        <section className="settings-card">
          <h3>Nova empresa</h3>
          <p>Você será o administrador. Depois complete os dados em Minha empresa.</p>

          <form className="settings-inline-form" onSubmit={handleCreate}>
            <div className="settings-field">
              <label htmlFor="new-company-name">Nome da empresa</label>
              <input
                id="new-company-name"
                type="text"
                value={newName}
                onChange={event => setNewName(event.target.value)}
              />
            </div>

            <button type="submit" className="settings-button" disabled={Boolean(busy)}>
              <Plus size={15} />
              {busy === "create" ? "Criando..." : "Criar e abrir"}
            </button>
          </form>
        </section>
      ) : (
        <div className="settings-note">Só administradores podem criar empresas.</div>
      )}

      <section className="settings-card">
        <h3>Entrar com código de convite</h3>

        <form className="settings-inline-form" onSubmit={handleCode}>
          <div className="settings-field">
            <label htmlFor="invite-code">Código</label>
            <input
              id="invite-code"
              type="text"
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              autoComplete="off"
              maxLength={20}
            />
          </div>

          <button type="submit" className="settings-button settings-button-secondary" disabled={Boolean(busy)}>
            {busy === "code" ? "Entrando..." : "Entrar na empresa"}
          </button>
        </form>
      </section>

      {errorMessage && <div className="settings-message settings-message-error">{errorMessage}</div>}
    </div>
  );
}

export default CompaniesSettings;
