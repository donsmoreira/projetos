/** Endereço opcional de clientes e fornecedores (colunas no banco). */
export interface AddressFields {
  zip_code: string | null;
  street: string | null;
  address_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}

/** Endereço no formulário (campos de texto, vazio = não informado). */
export interface AddressFormData {
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export const EMPTY_ADDRESS: AddressFormData = {
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: ""
};
