import { addressFromDb, validateAddress } from "../../utils/address";
import { documentKind, formatDocument, validateDocument } from "../../utils/document";

import { EMPTY_ADDRESS } from "../../types/address";
import type { Company, CompanyFormData } from "../../types/company";

/** Formulário em branco, para uma empresa nova. */
export function emptyCompanyForm(): CompanyFormData {
  return {
    document: "",
    personType: "",
    name: "",
    tradeName: "",
    taxRegime: "",
    stateRegistration: "",
    municipalRegistration: "",
    phone: "",
    email: "",
    website: "",
    address: { ...EMPTY_ADDRESS }
  };
}

/** Formulário preenchido com os dados de uma empresa já cadastrada. */
export function formFromCompany(company: Company): CompanyFormData {
  return {
    document: formatDocument(company.document),
    personType: company.person_type ?? "",
    name: company.name,
    tradeName: company.trade_name ?? "",
    taxRegime: company.tax_regime ?? "",
    stateRegistration: company.state_registration ?? "",
    municipalRegistration: company.municipal_registration ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    website: company.website ?? "",
    address: addressFromDb(company)
  };
}

/** Confere o formulário; devolve a mensagem do problema ou "" se estiver tudo certo. */
export function validateCompanyForm(form: CompanyFormData): string {
  const kind = documentKind(form.document);
  const isCnpj = kind === "cnpj";

  const documentError = validateDocument(form.document);

  if (documentError) {
    return documentError;
  }

  if (kind === "cpf" && !form.personType) {
    return "Com CPF, escolha se é pessoa física (PF) ou jurídica (PJ).";
  }

  if (!form.name.trim()) {
    return isCnpj ? "Informe a razão social." : "Informe o nome.";
  }

  if (isCnpj && !form.taxRegime) {
    return "Escolha o regime tributário.";
  }

  return validateAddress(form.address);
}
