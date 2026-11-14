import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

import type { ServiceInvoice, ServiceInvoiceFormData } from "../types/serviceInvoice";
import { TAX_NUMBER_COLUMNS, taxFieldsToDb } from "../utils/serviceTax";

const NUMBER_FIELDS = [
  "amount", "unconditional_discount", "deductions",
  "iss_rate", ...TAX_NUMBER_COLUMNS,
  "tax_base", "iss_amount", "pis_amount", "cofins_amount", "csll_amount",
  "irrf_amount", "inss_amount", "net_amount"
];

function normalize(row: Record<string, unknown>): ServiceInvoice {
  const result: Record<string, unknown> = { ...row };

  for (const key of NUMBER_FIELDS) {
    result[key] = Number(row[key] ?? 0);
  }

  return result as unknown as ServiceInvoice;
}

function toDb(form: ServiceInvoiceFormData) {
  const digits = (value: string) => value.replace(/\D/g, "");

  return {
    issue_date: form.issueDate,
    competence_date: form.competenceDate,
    client_id: form.clientId,
    service_id: form.serviceId || null,
    service_code: form.serviceCode.trim(),
    national_tax_code: digits(form.nationalTaxCode),
    municipal_tax_code: digits(form.municipalTaxCode) || null,
    nbs_code: digits(form.nbsCode) || null,
    description: form.description.trim(),
    amount: Number(form.amount || 0),
    unconditional_discount: Number(form.unconditionalDiscount || 0),
    deductions: Number(form.deductions || 0),
    iss_taxation: form.issTaxation,
    iss_rate: Number(form.issRate || 0),
    iss_withheld: form.issWithheld,
    ...taxFieldsToDb(form),
    notes: form.notes.trim() || null
  };
}

const SELECT = "*, clients (id, name)";

export async function listServiceInvoices(from: string, to: string): Promise<ServiceInvoice[]> {
  const { data, error } = await supabase
    .from("service_invoices")
    .select(SELECT)
    .gte("issue_date", from)
    .lte("issue_date", to)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []).map(normalize);
}

/** Salva a nota como rascunho (os valores são calculados pelo banco). */
export async function saveServiceInvoice(
  id: string | null,
  form: ServiceInvoiceFormData,
  environment: "homologacao" | "producao"
): Promise<ServiceInvoice> {
  const query = id
    ? supabase.from("service_invoices").update(toDb(form)).eq("id", id)
    : supabase.from("service_invoices").insert({ ...toDb(form), status: "rascunho", environment });

  const { data, error } = await query.select(SELECT).single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return normalize(data);
}

export async function deleteServiceInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("service_invoices").delete().eq("id", id);

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}
