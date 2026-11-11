import { useState } from "react";

import { Building2, ChevronRight } from "lucide-react";

import AuthLayout from "../../components/AuthLayout/AuthLayout";
import { useAuth } from "../../contexts/AuthContext";
import { useCompany } from "../../hooks/useCompany";
import { clearMustChooseCompany } from "../../utils/companyLogin";
import { formatDocument } from "../../utils/document";

import "../Onboarding/Onboarding.css";
import "./CompanySelect.css";

type CompanySelectProps = {
  /** Chamado ao escolher a empresa que já está aberta (não precisa recarregar) */
  onKeepCurrent: () => void;
};

/** Logo depois do login: em qual empresa do ID você vai operar agora. */
function CompanySelect({ onKeepCurrent }: CompanySelectProps) {
  const { signOut } = useAuth();
  const { companies, active, groupId, switchCompany } = useCompany();

  const [busy, setBusy] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function choose(companyId: string) {
    clearMustChooseCompany();

    if (active?.company.id === companyId) {
      onKeepCurrent();
      return;
    }

    try {
      setBusy(companyId);
      setErrorMessage("");
      await switchCompany(companyId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir a empresa.");
      setBusy("");
    }
  }

  return (
    <AuthLayout
      title="Em qual empresa você vai operar?"
      subtitle={`ID EMPRESA ${groupId ?? ""} · escolha uma das empresas liberadas para você.`}
    >
      <div className="onboarding">
        <ul className="company-select-list">
          {companies.map(item => {
            const company = item.company;

            return (
              <li key={company.id}>
                <button
                  type="button"
                  className="company-select-item"
                  disabled={Boolean(busy)}
                  onClick={() => void choose(company.id)}
                >
                  <span className="company-select-code">{company.code}</span>

                  <span className="company-select-text">
                    <strong>
                      <Building2 size={14} />
                      {company.trade_name || company.name}
                    </strong>
                    <small>
                      {company.document ? `${formatDocument(company.document)} · ` : ""}
                      {item.permissions.isAdmin ? "Administrador" : "Usuário"}
                      {active?.company.id === company.id ? " · aberta por último" : ""}
                    </small>
                  </span>

                  <ChevronRight size={18} />
                </button>
              </li>
            );
          })}
        </ul>

        {errorMessage && <p className="login-error">{errorMessage}</p>}

        <p className="login-footer">
          <button type="button" className="onboarding-link" onClick={() => void signOut()}>
            Sair e entrar com outro ID ou outra conta
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}

export default CompanySelect;
