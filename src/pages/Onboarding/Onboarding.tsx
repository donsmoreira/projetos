import { useRef, useState } from "react";
import type { FormEvent } from "react";

import AuthLayout from "../../components/AuthLayout/AuthLayout";
import { useAuth } from "../../contexts/AuthContext";
import { useCompany } from "../../hooks/useCompany";
import {
  acceptInvite,
  createCompany,
  updateCompany
} from "../../services/companyService";
import CompanyForm from "../Settings/CompanyForm";
import { emptyCompanyForm } from "../Settings/companyFormData";

import "./Onboarding.css";

/**
 * Conta que ainda não participa de nenhuma empresa (logo depois de criar a conta):
 * cadastrar a primeira empresa completa (nasce um ID EMPRESA novo, com a pessoa
 * como administradora) ou entrar numa empresa com código de convite.
 */
function Onboarding() {
  const { signOut } = useAuth();
  const { canCreateCompany, error: loadError } = useCompany();

  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Se a empresa foi criada mas o resto não salvou, tentar de novo não cria outra
  const createdId = useRef<string | null>(null);

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inviteCode.trim().length < 6) {
      setErrorMessage("Digite o código de convite que você recebeu.");
      return;
    }

    setBusy(true);
    setErrorMessage("");

    acceptInvite(inviteCode)
      .then(() => window.location.assign("/"))
      .catch(error => {
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível entrar na empresa.");
        setBusy(false);
      });
  }

  return (
    <AuthLayout
      wide
      title="Cadastre sua empresa"
      subtitle="Preencha os dados da sua empresa (ou os seus, se for pessoa física). Ao cadastrar, ela recebe um ID EMPRESA: anote, é com ele que você entra no sistema."
    >
      <div className="onboarding">
        {canCreateCompany && (
          <section className="onboarding-section onboarding-company-form">
            <CompanyForm
              initial={emptyCompanyForm()}
              canEdit
              submitLabel="Cadastrar empresa"
              savingLabel="Cadastrando..."
              onSubmit={async form => {
                if (!createdId.current) {
                  createdId.current = await createCompany(form.name.trim());
                }

                await updateCompany(createdId.current, form);

                // Abre o sistema já com a empresa nova (e o ID novo)
                window.location.assign("/configuracoes/empresas");
                return "";
              }}
            />
          </section>
        )}

        <form className="login-form onboarding-section" onSubmit={handleInvite}>
          <h2>Recebeu um código de convite?</h2>

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

          <button type="submit" className="login-button" disabled={busy}>
            {busy ? "Entrando..." : "Entrar na empresa"}
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
