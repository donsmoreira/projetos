import type {
  AddressFields,
  AddressFormData
} from "./address";
import type { ClientType } from "./client";
import type { TaxRegime } from "./company";

export interface Supplier extends AddressFields {
  id: string;
  user_id: string;

  name: string;
  document: string | null;
  /** Nome fantasia (vem da Receita ao buscar o CNPJ) */
  trade_name?: string | null;
  state_registration?: string | null;
  /** Enquadramento: simples, simples_mei, normal, nao_contribuinte */
  tax_regime?: TaxRegime | null;
  type?: ClientType | null;
  phone: string | null;
  email: string | null;
  notes: string | null;

  /** false = inativo (some das listas de escolha) */
  active?: boolean;

  created_at?: string;
  updated_at?: string;
}

export interface SupplierFormData {
  name: string;
  document: string;
  tradeName: string;
  stateRegistration: string;
  taxRegime: TaxRegime | "";
  type: ClientType | null;
  phone: string;
  email: string;
  notes: string;
  address: AddressFormData;
}
