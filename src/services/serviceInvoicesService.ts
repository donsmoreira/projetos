import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

import type { ServiceInvoice, ServiceInvoiceFormData } from "../types/serviceInvoice";
import { TAX_NUMBER_COLUMNS, taxFieldsToDb } from "../utils/serviceTax";

const NUMBER_FIELDS = [
  "amount", "unconditional_discount", "deductions",
  "iss_rate", ...TAX_NUMBER_COLUMNS, "installments", "card_interest_rate", "card_interest_amount",
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
    payment_term: form.paymentTerm,
    payment_method: form.paymentMethod,
    payment_account_id: form.paymentAccountId || null,
    installments: form.paymentTerm === "a_vista" ? 1 : Math.max(1, Math.floor(Number(form.installments) || 1)),
    first_due_date: form.paymentTerm === "a_prazo" && form.firstDueDate ? form.firstDueDate : null,
    card_interest_mode: form.paymentMethod === "credito" ? form.cardInterestMode : "sem_juros",
    card_interest_rate: form.paymentMethod === "credito" ? Math.round(Number(form.cardInterestRate || 0) * 1000) / 1000 : 0,
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

/** Parcelas que a nota vai gerar no Contas a Receber (conta feita pelo banco). */
export async function getInvoicePaymentPlan(
  id: string
): Promise<{ installment: number; due_date: string; value: number; received: boolean }[]> {
  const { data, error } = await supabase.rpc("service_invoice_payment_plan", { p_invoice_id: id });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    installment: Number(row.installment),
    due_date: String(row.due_date),
    value: Number(row.value),
    received: row.received === true
  }));
}

/** Lança a nota autorizada no Contas a Receber (usado pela emissão). Devolve quantas contas criou. */
export async function postInvoiceReceivables(id: string): Promise<number> {
  const { data, error } = await supabase.rpc("service_invoice_post_receivables", { p_invoice_id: id });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return Number(data ?? 0);
}

export async function deleteServiceInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("service_invoices").delete().eq("id", id);

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}
