import { useContext } from "react";

import { CompanyContext } from "../contexts/companyContext";
import { screenPermissions } from "../types/company";
import type { ModuleKey } from "../types/permissions";

/** Empresa aberta, empresas do usuário e permissões dele. */
export function useCompany() {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error("useCompany deve ser usado dentro do CompanyProvider.");
  }

  return context;
}

/** Atalho: o que o usuário pode fazer numa tela da empresa aberta. */
export function usePermissions(module: ModuleKey) {
  return screenPermissions(useCompany().permissions, module);
}
