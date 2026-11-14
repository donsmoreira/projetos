import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";

import type { Service, ServiceFormData } from "../types/service";

const digits = (value: string) => value.replace(/\D/g, "");

function normalizeService(row: Record<string, unknown>): Service {
  const num = (key: string) => Number(row[key] ?? 0);

  return {
    ...row,
    unit_price: num("unit_price"),
    iss_rate: num("iss_rate"),
    pis_rate: num("pis_rate"),
    cofins_rate: num("cofins_rate"),
    csll_rate: num("csll_rate"),
    irrf_rate: num("irrf_rate"),
    inss_rate: num("inss_rate"),
    active: row.active !== false
  } as Service;
}

function toDb(form: ServiceFormData) {
  return {
    code: form.code.trim(),
    description: form.description.trim(),
    unit_price: Math.round(Number(form.unitPrice || 0) * 100) / 100,
    national_tax_code: digits(form.nationalTaxCode),
    municipal_tax_code: digits(form.municipalTaxCode) || null,
    nbs_code: digits(form.nbsCode) || null,
    cnae: digits(form.cnae) || null,
    iss_taxation: form.issTaxation,
    iss_rate: Number(form.issRate || 0),
    iss_withheld: form.issWithheld,
    pis_rate: Number(form.pisRate || 0),
    cofins_rate: Number(form.cofinsRate || 0),
    csll_rate: Number(form.csllRate || 0),
    irrf_rate: Number(form.irrfRate || 0),
    inss_rate: Number(form.inssRate || 0),
    management_account_id: form.managementAccountId || null,
    category: form.category.trim() || null,
    notes: form.notes.trim() || null
  };
}

function friendlyError(message: string) {
  if (/services_company_code_uidx|duplicate key/i.test(message)) {
    return "Já existe um serviço com esse código.";
  }

  return translateCompanyError(message);
}

export async function listServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("code", { ascending: true });

  if (error) {
    throw new Error(friendlyError(error.message));
  }

  return (data ?? []).map(normalizeService);
}

export async function createService(form: ServiceFormData): Promise<Service> {
  const { data, error } = await supabase
    .from("services")
    .insert(toDb(form))
    .select()
    .single();

  if (error) {
    throw new Error(friendlyError(error.message));
  }

  return normalizeService(data);
}

export async function updateService(id: string, form: ServiceFormData): Promise<Service> {
  const { data, error } = await supabase
    .from("services")
    .update(toDb(form))
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(friendlyError(error.message));
  }

  return normalizeService(data);
}

export async function setServiceActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from("services").update({ active }).eq("id", id);

  if (error) {
    throw new Error(friendlyError(error.message));
  }
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) {
    throw new Error(friendlyError(error.message));
  }
}
