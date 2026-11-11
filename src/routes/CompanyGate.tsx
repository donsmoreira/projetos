import { Outlet } from "react-router-dom";

import { CompanyProvider } from "../contexts/CompanyProvider";
import { useCompany } from "../hooks/useCompany";
import Onboarding from "../pages/Onboarding/Onboarding";

function Gate() {
  const { loading, active } = useCompany();

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

  // Sem empresa aberta: escolher, criar a primeira ou entrar com convite
  if (!active) {
    return <Onboarding />;
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
