import type {
  AddressFields,
  AddressFormData
} from "./address";

export interface Supplier extends AddressFields {
  id: string;
  user_id: string;

  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface SupplierFormData {
  name: string;
  document: string;
  phone: string;
  email: string;
  notes: string;
  address: AddressFormData;
}
