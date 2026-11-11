import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";
import { getAuthenticatedUser } from "./auth";
import { addressToDb } from "../utils/address";

import type {
  Supplier,
  SupplierFormData
} from "../types/supplier";

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []) as Supplier[];
}

export async function createSupplier(
  supplier: SupplierFormData
): Promise<Supplier> {
  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      user_id: user.id,
      name: supplier.name,
      document: supplier.document || null,
      trade_name: supplier.tradeName.trim() || null,
      state_registration: supplier.stateRegistration.trim() || null,
      phone: supplier.phone || null,
      email: supplier.email || null,
      notes: supplier.notes || null,
      ...addressToDb(supplier.address)
    })
    .select()
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return data as Supplier;
}

export async function updateSupplier(
  id: string,
  supplier: SupplierFormData
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .update({
      name: supplier.name,
      document: supplier.document || null,
      trade_name: supplier.tradeName.trim() || null,
      state_registration: supplier.stateRegistration.trim() || null,
      phone: supplier.phone || null,
      email: supplier.email || null,
      notes: supplier.notes || null,
      ...addressToDb(supplier.address),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return data as Supplier;
}

export async function deleteSupplier(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}