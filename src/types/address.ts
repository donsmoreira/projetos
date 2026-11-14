/** Endereço opcional de clientes e fornecedores (colunas no banco). */
export interface AddressFields {
  zip_code: string | null;
  street: string | null;
  address_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  /** Código IBGE do município (7 números), usado na nota fiscal */
  city_code?: string | null;
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
  /** Código IBGE do município: vem sozinho pelo CEP */
  cityCode: string;
}

export const EMPTY_ADDRESS: AddressFormData = {
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  cityCode: ""
};
