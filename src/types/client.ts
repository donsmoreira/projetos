import type {
  AddressFields,
  AddressFormData
} from "./address";
import type { TaxRegime } from "./company";

export type ClientType = "Pessoa Física" | "Pessoa Jurídica";

export interface Client extends AddressFields {
  id: string;

  user_id: string;

  name: string;

  type: ClientType | null;

  document: string | null;

  /** Nome fantasia (vem da Receita ao buscar o CNPJ) */
  trade_name?: string | null;

  state_registration?: string | null;

  /** Enquadramento: simples, simples_mei, normal, nao_contribuinte */
  tax_regime?: TaxRegime | null;

  phone: string | null;

  email: string | null;

  notes: string | null;

  created_at?: string;

  updated_at?: string;
}

export interface ClientFormData {
  name: string;

  type: ClientType | null;

  document: string;

  tradeName: string;

  stateRegistration: string;

  taxRegime: TaxRegime | "";

  phone: string;

  email: string;

  notes: string;

  address: AddressFormData;
}