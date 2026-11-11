import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { normalizeUsername } from "../utils/username";

import type { CompanyPermissions } from "../types/company";

/**
 * Cadastro de usuários com nome de usuário e senha.
 * Roda na função "admin-users" do Supabase, que tem a chave secreta
 * (o site nunca tem essa chave).
 */
async function callAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });

  if (error) {
    // A função devolve { error: "mensagem em português" }
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { error?: string } | null;

      if (payload?.error) {
        throw new Error(payload.error);
      }
    }

    throw new Error(
      "Não foi possível falar com a função de usuários do Supabase. Confira se a função \"admin-users\" foi publicada."
    );
  }

  return data as T;
}

export type NewUserData = {
  fullName: string;
  username: string;
  password: string;
  companyIds: string[];
  permissions: CompanyPermissions;
};

/** Cria o usuário já com as empresas e as permissões (as mesmas em cada empresa). */
export async function createUsernameUser(data: NewUserData): Promise<void> {
  await callAdminUsers({
    action: "create",
    fullName: data.fullName.trim(),
    username: normalizeUsername(data.username),
    password: data.password,
    companyIds: data.companyIds,
    isAdmin: data.permissions.isAdmin,
    modules: data.permissions.modules
  });
}

/** Troca a senha de um usuário com nome de usuário. */
export async function resetUsernamePassword(userId: string, password: string): Promise<void> {
  await callAdminUsers({ action: "reset_password", userId, password });
}

/**
 * Empresas em que o usuário opera (entre as que você administra).
 * Nas empresas novas ele entra com as permissões informadas.
 */
export async function setUserCompanies(
  userId: string,
  companyIds: string[],
  permissions: CompanyPermissions
): Promise<void> {
  await callAdminUsers({
    action: "set_companies",
    userId,
    companyIds,
    isAdmin: permissions.isAdmin,
    modules: permissions.modules
  });
}

/** Em quais empresas (entre todas as que eu vejo) o usuário está. */
export async function listUserCompanyIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(row => row.company_id as string);
}
