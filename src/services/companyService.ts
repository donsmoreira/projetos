import { supabase } from "./supabase";
import { getAuthenticatedUser } from "./auth";
import { addressToDb } from "../utils/address";
import { documentDigits, documentKind } from "../utils/document";

import type {
  Company,
  CompanyFormData,
  CompanyInvite,
  CompanyMember,
  CompanyMembership,
  CompanyPermissions,
  ProfileFormData,
  UserProfile
} from "../types/company";
import { ALL_ACTIONS, ALL_MODULES } from "../types/permissions";
import type {
  ModuleAction,
  ModuleKey,
  ModulePermission,
  ModulePermissions
} from "../types/permissions";

type MembershipRow = {
  company_id: string;
  is_admin: boolean;
  companies: Company | Company[] | null;
};

type ModulePermissionRow = {
  company_id: string;
  user_id: string;
  module: ModuleKey;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_settle: boolean;
};

const PERMISSION_COLUMNS =
  "company_id, user_id, module, can_view, can_create, can_update, can_delete, can_settle";

/** Linhas do banco → permissões por tela (de um usuário numa empresa). */
function modulesFromRows(rows: ModulePermissionRow[]): ModulePermissions {
  return Object.fromEntries(
    rows.map(row => [
      row.module,
      {
        view: row.can_view,
        create: row.can_create,
        update: row.can_update,
        delete: row.can_delete,
        settle: row.can_settle
      }
    ])
  );
}

/** Convite: JSON do banco → permissões por tela. */
function modulesFromJson(value: unknown): ModulePermissions {
  const source = (value ?? {}) as Record<string, Partial<Record<ModuleAction, boolean>>>;

  return Object.fromEntries(
    ALL_MODULES.filter(module => source[module.key]).map(module => [
      module.key,
      Object.fromEntries(
        ALL_ACTIONS.map(action => [action, Boolean(source[module.key]?.[action])])
      ) as ModulePermission
    ])
  );
}

/** Permissões por tela → JSON para as funções do banco. */
function modulesToJson(modules: ModulePermissions) {
  return Object.fromEntries(
    ALL_MODULES.map(module => [
      module.key,
      Object.fromEntries(
        ALL_ACTIONS.map(action => [action, Boolean(modules[module.key]?.[action])])
      )
    ])
  );
}

/** Mensagens do banco em português para o que a pessoa não pode fazer. */
export function translateCompanyError(message: string): string {
  if (/row-level security|permission denied/i.test(message)) {
    return "Você não tem permissão para fazer isso nesta empresa.";
  }

  return message;
}

function fail(error: { message: string }): never {
  throw new Error(translateCompanyError(error.message));
}

/** Empresas de que o usuário participa, com as permissões dele em cada uma. */
export async function listMyCompanies(): Promise<CompanyMembership[]> {
  const user = await getAuthenticatedUser();

  const [members, modules] = await Promise.all([
    supabase
      .from("company_members")
      .select("company_id, is_admin, companies (*)")
      .eq("user_id", user.id),
    supabase
      .from("company_member_permissions")
      .select(PERMISSION_COLUMNS)
      .eq("user_id", user.id)
  ]);

  if (members.error) {
    fail(members.error);
  }

  if (modules.error) {
    fail(modules.error);
  }

  const moduleRows = (modules.data ?? []) as ModulePermissionRow[];

  return ((members.data ?? []) as unknown as MembershipRow[])
    .map(row => ({
      company: (Array.isArray(row.companies) ? row.companies[0] : row.companies) as Company,
      permissions: {
        isAdmin: row.is_admin,
        modules: modulesFromRows(moduleRows.filter(item => item.company_id === row.company_id))
      }
    }))
    .filter(item => Boolean(item.company))
    .sort((a, b) =>
      (a.company.trade_name || a.company.name).localeCompare(
        b.company.trade_name || b.company.name,
        "pt-BR",
        { sensitivity: "base" }
      )
    );
}

/** Empresa aberta agora (null = nenhuma). */
export async function getActiveCompanyId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("current_company_id");

  if (error) {
    fail(error);
  }

  return (data as string | null) ?? null;
}

/** ID EMPRESA com que a pessoa entrou (null = nenhum). */
export async function getActiveGroupId(): Promise<number | null> {
  const { data, error } = await supabase.rpc("current_group_id");

  if (error) {
    fail(error);
  }

  return (data as number | null) ?? null;
}

export async function setActiveCompany(companyId: string): Promise<void> {
  const { error } = await supabase.rpc("set_active_company", {
    p_company_id: companyId
  });

  if (error) {
    fail(error);
  }
}

/** Cria a empresa (quem cria vira administrador) e já deixa aberta. */
export async function createCompany(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_company", {
    p_name: name
  });

  if (error) {
    fail(error);
  }

  return data as string;
}

export async function updateCompany(
  id: string,
  form: CompanyFormData
): Promise<Company> {
  const document = documentDigits(form.document);
  const kind = documentKind(document);
  const isCnpj = kind === "cnpj";
  const isPf = kind === "cpf" && form.personType === "PF";

  const { data, error } = await supabase
    .from("companies")
    .update({
      document: document || null,
      // CNPJ é sempre PJ; com CPF a pessoa escolhe
      person_type: isCnpj ? "PJ" : form.personType || null,
      name: form.name.trim(),
      // Pessoa física não tem nome fantasia nem enquadramento
      trade_name: isPf ? null : form.tradeName.trim() || null,
      tax_regime: isPf ? null : form.taxRegime || null,
      state_registration: form.stateRegistration.trim() || null,
      municipal_registration: form.municipalRegistration.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      ...addressToDb(form.address),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    fail(error);
  }

  return data as Company;
}

/** Usuários da empresa aberta, com as permissões por tela (o administrador vê de todos). */
export async function listCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  const [members, modules] = await Promise.all([
    supabase.rpc("list_company_members"),
    supabase
      .from("company_member_permissions")
      .select(PERMISSION_COLUMNS)
      .eq("company_id", companyId)
  ]);

  if (members.error) {
    fail(members.error);
  }

  if (modules.error) {
    fail(modules.error);
  }

  const moduleRows = (modules.data ?? []) as ModulePermissionRow[];

  return ((members.data ?? []) as {
    user_id: string;
    full_name: string | null;
    email: string;
    is_admin: boolean;
    created_at: string;
  }[]).map(row => ({
    userId: row.user_id,
    fullName: row.full_name?.trim() || "",
    email: row.email,
    createdAt: row.created_at,
    isAdmin: row.is_admin,
    modules: modulesFromRows(moduleRows.filter(item => item.user_id === row.user_id))
  }));
}

/** Salva se é administrador e as permissões por tela de um usuário. */
export async function updateMemberPermissions(
  userId: string,
  permissions: CompanyPermissions
): Promise<void> {
  const { error } = await supabase.rpc("set_member_permissions", {
    p_user_id: userId,
    p_is_admin: permissions.isAdmin,
    p_permissions: modulesToJson(permissions.modules)
  });

  if (error) {
    fail(error);
  }
}

/** Administrador muda o nome de um usuário da empresa aberta. */
export async function updateMemberName(userId: string, fullName: string): Promise<void> {
  const { error } = await supabase.rpc("update_member_name", {
    p_user_id: userId,
    p_full_name: fullName.trim()
  });

  if (error) {
    fail(error);
  }
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_member", {
    p_user_id: userId
  });

  if (error) {
    fail(error);
  }
}

/** Gera o código de convite com as permissões escolhidas. */
export async function createInvite(
  permissions: CompanyPermissions
): Promise<string> {
  const { data, error } = await supabase.rpc("create_invite", {
    p_is_admin: permissions.isAdmin,
    p_permissions: modulesToJson(permissions.modules)
  });

  if (error) {
    fail(error);
  }

  return data as string;
}

/** Convites da empresa aberta ainda não usados (só o administrador vê). */
export async function listPendingInvites(
  companyId: string
): Promise<CompanyInvite[]> {
  const { data, error } = await supabase
    .from("company_invites")
    .select("*")
    .eq("company_id", companyId)
    .is("used_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    fail(error);
  }

  return (data ?? []).map(row => ({
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    isAdmin: row.is_admin,
    modules: modulesFromJson(row.module_permissions)
  }));
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_invite", {
    p_invite_id: inviteId
  });

  if (error) {
    fail(error);
  }
}

/** Entra na empresa com o código e já deixa ela aberta. */
export async function acceptInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_invite", {
    p_code: code.trim().toUpperCase()
  });

  if (error) {
    fail(error);
  }

  return data as string;
}

export async function getMyProfile(): Promise<UserProfile> {
  const user = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    fail(error);
  }

  return data as UserProfile;
}

export async function updateMyProfile(
  form: ProfileFormData
): Promise<UserProfile> {
  const user = await getAuthenticatedUser();
  const cpf = documentDigits(form.cpf).slice(0, 11);

  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: form.fullName.trim(),
      phone: form.phone.trim() || null,
      cpf: cpf.length === 11 ? cpf : null,
      ...addressToDb(form.address),
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    fail(error);
  }

  // O nome também vai para a sessão, para aparecer no topo sem recarregar
  await supabase.auth.updateUser({
    data: { full_name: form.fullName.trim() }
  });

  return data as UserProfile;
}
