import { useState } from "react";
import type { FormEvent } from "react";

import AuthLayout from "../../components/AuthLayout/AuthLayout";
import { useAuth } from "../../contexts/AuthContext";
import { useCompany } from "../../hooks/useCompany";
import {
  acceptInvite,
  createCompany
} from "../../services/companyService";

import "./Onboarding.css";

/**
 * Quando o usuário ainda não tem empresa aberta:
 * abrir uma das empresas dele, criar a primeira ou entrar com código de convite.
 */
function Onboarding() {
  const { signOut } = useAuth();
  const {
    companies,
    canCreateCompany,
    switchCompany,
    error: loadError
  } = useCompany();

  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState<"" | "create" | "invite" | "open">("");
  const [errorMessage, setErrorMessage] = useState("");

  async function run(kind: "create" | "invite" | "open", action: () => Promise<unknown>) {
    try {
      setBusy(kind);
      setErrorMessage("");
      await action();
      window.location.assign("/");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível continuar.");
      setBusy("");
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyName.trim()) {
      setErrorMessage("Informe o nome da empresa.");
      return;
    }

    void run("create", () => createCompany(companyName.trim()));
  }

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inviteCode.trim().length < 6) {
      setErrorMessage("Digite o código de convite que você recebeu.");
      return;
    }

    void run("invite", () => acceptInvite(inviteCode));
  }

  return (
    <AuthLayout
      title="Escolha a empresa"
      subtitle={
        companies.length > 0
          ? "Abra uma das suas empresas para continuar."
          : "Para começar, crie sua empresa ou entre com um código de convite."
      }
    >
      <div className="onboarding">
        {companies.length > 0 && (
          <section className="onboarding-section">
            <h2>Suas empresas</h2>

            <ul className="onboarding-companies">
              {companies.map(item => (
                <li key={item.company.id}>
                  <span>
                    <strong>{item.company.trade_name || item.company.name}</strong>
                    <small>{item.permissions.isAdmin ? "Administrador" : "Usuário"}</small>
                  </span>

                  <button
                    type="button"
                    className="login-button onboarding-small-button"
                    disabled={Boolean(busy)}
                    onClick={() => void run("open", () => switchCompany(item.company.id))}
                  >
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canCreateCompany && (
          <form className="login-form onboarding-section" onSubmit={handleCreate}>
            <h2>{companies.length > 0 ? "Nova empresa" : "Criar minha empresa"}</h2>

            <div className="login-field">
              <label htmlFor="onboarding-company">
                Nome da empresa (ou o seu nome, se for pessoa física)
              </label>

              <input
                id="onboarding-company"
                type="text"
                value={companyName}
                onChange={event => setCompanyName(event.target.value)}
                autoFocus={companies.length === 0}
              />
            </div>

            <p className="onboarding-hint">
              Você será o administrador. O CNPJ ou CPF e o restante dos dados ficam em
              Configurações → Empresas → Cadastro.
            </p>

            <button type="submit" className="login-button" disabled={Boolean(busy)}>
              {busy === "create" ? "Criando..." : "Criar empresa"}
            </button>
          </form>
        )}

        <form className="login-form onboarding-section" onSubmit={handleInvite}>
          <h2>Tenho um código de convite</h2>

          <div className="login-field">
            <label htmlFor="onboarding-code">
              Código recebido do administrador da empresa
            </label>

            <input
              id="onboarding-code"
              type="text"
              value={inviteCode}
              onChange={event => setInviteCode(event.target.value.toUpperCase())}
              placeholder="EX.: 4F9A1C2B7D"
              autoComplete="off"
              maxLength={20}
            />
          </div>

          <button type="submit" className="login-button" disabled={Boolean(busy)}>
            {busy === "invite" ? "Entrando..." : "Entrar na empresa"}
          </button>
        </form>

        {(errorMessage || loadError) && (
          <p className="login-error">{errorMessage || loadError}</p>
        )}

        <p className="login-footer">
          <button type="button" className="onboarding-link" onClick={() => void signOut()}>
            Sair e entrar com outra conta
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}

export default Onboarding;
