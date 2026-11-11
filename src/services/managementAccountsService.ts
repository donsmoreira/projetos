import { supabase } from "./supabase";
import { getAuthenticatedUser } from "./auth";

import type {
  ManagementAccount,
  ManagementAccountFormData
} from "../types/managementAccount";

const TABLE = "management_accounts";

function translateError(message: string): string {
  if (/row-level security|permission denied/i.test(message)) {
    return "Você não tem permissão para fazer isso nesta empresa.";
  }

  if (/management_accounts_unique_name|duplicate key/i.test(message)) {
    return "Já existe uma conta com esse nome nesse mesmo nível.";
  }

  if (/foreign key/i.test(message) && /payables|receivables/i.test(message)) {
    return "Essa conta já é usada em contas a pagar ou a receber, por isso não pode ser excluída.";
  }

  if (/foreign key|violates foreign key/i.test(message)) {
    return "Essa conta tem subcontas. Exclua ou mova as subcontas antes.";
  }

  if (/relation .*management_accounts.* does not exist|Could not find the table/i.test(message)) {
    return "A tabela de contas gerenciais ainda não existe no Supabase. Rode o SQL supabase/migrations/20261110_contas_gerenciais.sql.";
  }

  return message;
}

function toRow(account: ManagementAccountFormData) {
  return {
    name: account.name.trim(),
    type: account.type,
    nature: account.nature,
    parent_id: account.parentId || null
  };
}

export async function listManagementAccounts(): Promise<ManagementAccount[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("name", {
      ascending: true
    });

  if (error) {
    throw new Error(translateError(error.message));
  }

  return (data ?? []) as ManagementAccount[];
}

export async function createManagementAccount(
  account: ManagementAccountFormData
): Promise<ManagementAccount> {
  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: user.id,
      ...toRow(account)
    })
    .select()
    .single();

  if (error) {
    throw new Error(translateError(error.message));
  }

  return data as ManagementAccount;
}

export async function updateManagementAccount(
  id: string,
  account: ManagementAccountFormData
): Promise<ManagementAccount> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ...toRow(account),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(translateError(error.message));
  }

  return data as ManagementAccount;
}

export async function deleteManagementAccount(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(translateError(error.message));
  }
}
