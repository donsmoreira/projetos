import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "./supabase";

import type { CompanyPermissions } from "../types/company";

/**
 * Cadastro de usuários (e-mail e senha) nas empresas do ID EMPRESA aberto.
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
  email: string;
  password: string;
  companyIds: string[];
  permissions: CompanyPermissions;
};

/**
 * Cadastra o usuário nas empresas marcadas, com as mesmas permissões em todas.
 * Se o e-mail já tiver conta, ele só entra nas empresas (a senha dele não muda).
 * Devolve true quando a conta já existia.
 */
export async function createCompanyUser(data: NewUserData): Promise<boolean> {
  const result = await callAdminUsers<{ existing: boolean }>({
    action: "create",
    fullName: data.fullName.trim(),
    email: data.email.trim().toLowerCase(),
    password: data.password,
    companyIds: data.companyIds,
    isAdmin: data.permissions.isAdmin,
    modules: data.permissions.modules
  });

  return Boolean(result?.existing);
}

/** Troca a senha de um usuário (só de quem opera apenas em empresas suas). */
export async function resetUserPassword(userId: string, password: string): Promise<void> {
  await callAdminUsers({ action: "reset_password", userId, password });
}

/**
 * Empresas do ID em que o usuário opera (entre as que você administra).
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

/** Em quais empresas (entre as que eu vejo) o usuário está. */
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
