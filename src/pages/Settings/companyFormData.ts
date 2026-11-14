import { addressFromDb, validateAddress } from "../../utils/address";
import { documentKind, formatDocument, validateDocument } from "../../utils/document";

import { EMPTY_ADDRESS } from "../../types/address";
import type { Company, CompanyFormData } from "../../types/company";

/** "6201501" → "6201-5/01" (enquanto digita, formata o que já tem). */
export function formatCnae(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 7);

  if (digits.length <= 4) return digits;
  if (digits.length === 5) return `${digits.slice(0, 4)}-${digits.slice(4)}`;

  return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
}

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
    address: { ...EMPTY_ADDRESS },
    cnae: "",
    cnaeDescription: "",
    specialTaxRegime: "nenhum",
    nfseSeries: "1",
    nfseNextNumber: 1,
    nfseEnvironment: "homologacao"
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
    address: addressFromDb(company),
    cnae: formatCnae(company.cnae),
    cnaeDescription: company.cnae_description ?? "",
    specialTaxRegime: company.special_tax_regime ?? "nenhum",
    nfseSeries: company.nfse_series ?? "1",
    nfseNextNumber: company.nfse_next_number ?? 1,
    nfseEnvironment: company.nfse_environment ?? "homologacao"
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

  const cnae = form.cnae.replace(/\D/g, "");

  if (cnae.length > 0 && cnae.length !== 7) {
    return "O CNAE precisa ter 7 números (ex.: 6201-5/01).";
  }

  if (!/^[0-9A-Za-z]{1,5}$/.test(form.nfseSeries.trim())) {
    return "A série da nota deve ter de 1 a 5 letras ou números (ex.: 1).";
  }

  if (!Number.isInteger(form.nfseNextNumber) || form.nfseNextNumber < 1) {
    return "O próximo número da nota precisa ser 1 ou maior.";
  }

  return validateAddress(form.address);
}
