import { createContext } from "react";

import type {
  CompanyMembership,
  CompanyPermissions
} from "../types/company";

export type CompanyContextValue = {
  loading: boolean;
  error: string;
  /** ID EMPRESA com que entrou (null = nenhum) */
  groupId: number | null;
  /** A conta participa de alguma empresa (de qualquer ID)? */
  hasAnyCompany: boolean;
  /** Empresas do ID EMPRESA aberto de que o usuário participa */
  companies: CompanyMembership[];
  /** Empresa aberta (null = nenhuma: mostra a tela de primeira empresa/convite) */
  active: CompanyMembership | null;
  /** Permissões na empresa aberta */
  permissions: CompanyPermissions;
  /** Pode criar empresas: é administrador de alguma (ou ainda não tem nenhuma) */
  canCreateCompany: boolean;
  /** Abre outra empresa (recarrega o sistema com os dados dela) */
  switchCompany: (companyId: string) => Promise<void>;
  /** Busca de novo as empresas e permissões */
  reload: () => Promise<void>;
};

export const CompanyContext =
  createContext<CompanyContextValue | undefined>(undefined);
