import { supabase } from "./supabase";
import { translateCompanyError } from "./companyService";
import { getAuthenticatedUser } from "./auth";
import { addressToDb } from "../utils/address";

import type {
  Client,
  ClientFormData
} from "../types/client";

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return (data ?? []) as Client[];
}

export async function createClient(
  client: ClientFormData
): Promise<Client> {

  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id: user.id,

      name: client.name,

      type: client.type || null,

      document: client.document || null,

      trade_name: client.tradeName.trim() || null,

      state_registration: client.stateRegistration.trim() || null,

      tax_regime: client.taxRegime || null,

      phone: client.phone || null,

      email: client.email || null,

      notes: client.notes || null,

      ...addressToDb(client.address)
    })
    .select()
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return data as Client;
}

export async function updateClient(
  id: string,
  client: ClientFormData
): Promise<Client> {

  const { data, error } = await supabase
    .from("clients")
    .update({

      name: client.name,

      type: client.type || null,

      document: client.document || null,

      trade_name: client.tradeName.trim() || null,

      state_registration: client.stateRegistration.trim() || null,

      tax_regime: client.taxRegime || null,

      phone: client.phone || null,

      email: client.email || null,

      notes: client.notes || null,

      ...addressToDb(client.address),

      updated_at: new Date().toISOString()

    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }

  return data as Client;
}

export async function deleteClient(
  id: string
): Promise<void> {

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(translateCompanyError(error.message));
  }
}