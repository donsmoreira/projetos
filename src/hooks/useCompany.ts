import { useContext } from "react";

import { CompanyContext } from "../contexts/companyContext";

/** Empresa aberta, empresas do usuário e permissões dele. */
export function useCompany() {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error("useCompany deve ser usado dentro do CompanyProvider.");
  }

  return context;
}

/** Atalho: o que o usuário pode fazer na empresa aberta. */
export function usePermissions() {
  return useCompany().permissions;
}
