import type { Client } from "../types/client";
import type { Company } from "../types/company";
import type { ServiceInvoiceFormData } from "../types/serviceInvoice";

const onlyDigits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/** O que falta no cadastro da EMPRESA (prestador) para emitir a NFS-e. */
export function providerMissing(company: Company | null | undefined): string[] {
  if (!company) return ["Abra uma empresa."];

  const missing: string[] = [];
  const doc = onlyDigits(company.document);

  if (doc.length !== 11 && doc.length !== 14) missing.push("CPF ou CNPJ da empresa");
  if (!company.municipal_registration?.trim()) missing.push("inscrição municipal");
  if (!company.tax_regime && doc.length === 14) missing.push("enquadramento (regime tributário)");
  if (onlyDigits(company.zip_code).length !== 8) missing.push("CEP");
  if (!company.street?.trim()) missing.push("rua do endereço");
  if (!company.address_number?.trim()) missing.push("número do endereço");
  if (onlyDigits(company.city_code).length !== 7) missing.push("código IBGE da cidade");

  return missing;
}

/** O que falta no cadastro do CLIENTE (tomador). */
export function takerMissing(client: Client | null | undefined): string[] {
  if (!client) return ["escolha o cliente (tomador)"];

  const missing: string[] = [];
  const doc = onlyDigits(client.document);

  if (doc.length !== 11 && doc.length !== 14) missing.push("CPF ou CNPJ do cliente");
  if (onlyDigits(client.zip_code).length !== 8) missing.push("CEP do cliente");
  if (onlyDigits(client.city_code).length !== 7) missing.push("código IBGE da cidade do cliente");
  if (!client.email?.trim()) missing.push("e-mail do cliente (para enviar a nota)");

  return missing;
}

/** Arredonda como o banco de dados (round half away from zero, 2 casas). */
function round2(value: number) {
  const cents = Math.round(Math.abs(value) * 100 + 1e-9);
  return (Math.sign(value) * cents) / 100;
}

export type InvoiceTotals = {
  taxBase: number;
  iss: number;
  pis: number;
  cofins: number;
  csll: number;
  irrf: number;
  inss: number;
  /** retenções federais (só o que é descontado do líquido) */
  federal: number;
  withheld: number;
  net: number;
  /** Mensagem quando os valores não fecham */
  problem: string;
};

/**
 * Mesma conta do banco (função service_invoice_compute), só para mostrar na
 * tela enquanto a nota é montada. O valor gravado é sempre o do banco.
 */
export function computeInvoiceTotals(form: ServiceInvoiceFormData): InvoiceTotals {
  const amount = round2(Number(form.amount || 0));
  const discount = round2(Number(form.unconditionalDiscount || 0));
  const deductions = round2(Number(form.deductions || 0));
  const base = round2(amount - discount - deductions);

  const pct = (rate: number) => round2((base * Number(rate || 0)) / 100);

  const iss = form.issTaxation === "tributavel" ? pct(form.issRate) : 0;
  const pis = pct(form.pisRate);
  const cofins = pct(form.cofinsRate);
  const csll = pct(form.csllRate);
  const irrf = pct(form.irrfRate);
  const inss = pct(form.inssRate);
  // Retenções federais: PIS, COFINS e CSLL só quando marcados como retidos; IRRF e INSS sempre
  const federal = round2(
    (form.pisWithheld ? pis : 0) + (form.cofinsWithheld ? cofins : 0) + (form.csllWithheld ? csll : 0) + irrf + inss
  );
  const withheld = round2((form.issWithheld ? iss : 0) + federal);
  const net = round2(amount - discount - withheld);

  let problem = "";

  if (amount <= 0) {
    problem = "Informe o valor do serviço.";
  } else if (base <= 0) {
    problem = "O valor do serviço precisa ser maior que o desconto e as deduções.";
  } else if (net < 0) {
    problem = "As retenções são maiores que o valor da nota.";
  }

  return { taxBase: base, iss, pis, cofins, csll, irrf, inss, federal, withheld, net, problem };
}
