import { useState } from "react";
import { Outlet } from "react-router-dom";

import { CompanyProvider } from "../contexts/CompanyProvider";
import { useAuth } from "../contexts/AuthContext";
import { useCompany } from "../hooks/useCompany";
import AuthLayout from "../components/AuthLayout/AuthLayout";
import CompanySelect from "../pages/CompanySelect/CompanySelect";
import Onboarding from "../pages/Onboarding/Onboarding";
import { clearMustChooseCompany, mustChooseCompany } from "../utils/companyLogin";

/** Conta com empresas, mas sem ID EMPRESA aberto: precisa entrar de novo com o ID. */
function NeedCompanyId() {
  const { signOut } = useAuth();

  return (
    <AuthLayout
      title="Entre com o ID EMPRESA"
      subtitle="Para continuar, saia e entre de novo informando o ID EMPRESA."
    >
      <button type="button" className="login-button" onClick={() => void signOut()}>
        Sair e entrar com o ID
      </button>
    </AuthLayout>
  );
}

function Gate() {
  const { loading, active, companies, groupId, hasAnyCompany } = useCompany();
  // Logo depois do login a pessoa escolhe a empresa (mesmo que já tenha uma aberta)
  const [choosing, setChoosing] = useState(mustChooseCompany);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-light)"
        }}
      >
        Carregando empresa...
      </div>
    );
  }

  // Conta sem nenhuma empresa: criar a primeira ou entrar com convite
  if (!hasAnyCompany) {
    return <Onboarding />;
  }

  // Tem empresas, mas não entrou com um ID (sessão antiga)
  if (!groupId || companies.length === 0) {
    return <NeedCompanyId />;
  }

  // Só uma empresa no ID e ela já está aberta: não precisa perguntar
  if (choosing && companies.length === 1 && active) {
    clearMustChooseCompany();
    return <Outlet />;
  }

  if (choosing || !active) {
    return <CompanySelect onKeepCurrent={() => setChoosing(false)} />;
  }

  return <Outlet />;
}

/** Depois do login: só entra no sistema com uma empresa aberta. */
function CompanyGate() {
  return (
    <CompanyProvider>
      <Gate />
    </CompanyProvider>
  );
}

export default CompanyGate;
