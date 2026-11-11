import type { AddressFields, AddressFormData } from "./address";
import type { ModuleKey, ModulePermissions } from "./permissions";

export type PersonType = "PF" | "PJ";

export type TaxRegime =
  | "simples"
  | "simples_mei"
  | "normal"
  | "nao_contribuinte";

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  simples: "Simples Nacional",
  simples_mei: "Simples Nacional – MEI",
  normal: "Regime Normal",
  nao_contribuinte: "Não contribuinte"
};

export interface Company extends AddressFields {
  id: string;
  /** Nome (CPF) ou razão social (CNPJ) */
  name: string;
  trade_name: string | null;
  /** Só números: 11 = CPF, 14 = CNPJ */
  document: string | null;
  person_type: PersonType | null;
  tax_regime: TaxRegime | null;
  state_registration: string | null;
  municipal_registration: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CompanyFormData {
  document: string;
  personType: PersonType | "";
  name: string;
  tradeName: string;
  taxRegime: TaxRegime | "";
  stateRegistration: string;
  municipalRegistration: string;
  phone: string;
  email: string;
  website: string;
  address: AddressFormData;
}

/** O que o usuário pode fazer na empresa */
export interface CompanyPermissions {
  /** Administrador: pode tudo em todas as telas */
  isAdmin: boolean;
  /** Permissões por tela */
  modules: ModulePermissions;
}

/** O que o usuário pode fazer numa tela (já considerando o administrador) */
export interface ScreenPermissions {
  isAdmin: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Baixar = pagar, receber e estornar */
  canSettle: boolean;
}

export function screenPermissions(
  permissions: CompanyPermissions,
  module: ModuleKey
): ScreenPermissions {
  const own = permissions.modules[module];
  const admin = permissions.isAdmin;

  return {
    isAdmin: admin,
    canView: admin || Boolean(own?.view),
    canCreate: admin || Boolean(own?.create),
    canUpdate: admin || Boolean(own?.update),
    canDelete: admin || Boolean(own?.delete),
    canSettle: admin || Boolean(own?.settle)
  };
}

/** Empresa de que o usuário participa, com as permissões dele nela */
export interface CompanyMembership {
  company: Company;
  permissions: CompanyPermissions;
}

/** Usuário da empresa (tela de usuários e permissões) */
export interface CompanyMember extends CompanyPermissions {
  userId: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface CompanyInvite extends CompanyPermissions {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface UserProfile extends AddressFields {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  cpf: string | null;
  active_company_id: string | null;
}

export interface ProfileFormData {
  fullName: string;
  phone: string;
  cpf: string;
  address: AddressFormData;
}

export const NO_PERMISSIONS: CompanyPermissions = {
  isAdmin: false,
  modules: {}
};
