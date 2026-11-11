import type {
  AddressFields,
  AddressFormData
} from "./address";

export type ClientType = "Pessoa Física" | "Pessoa Jurídica";

export interface Client extends AddressFields {
  id: string;

  user_id: string;

  name: string;

  type: ClientType | null;

  document: string | null;

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

  phone: string;

  email: string;

  notes: string;

  address: AddressFormData;
}