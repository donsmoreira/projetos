export type ManagementAccountType =
  | "receita"
  | "despesa";

export type ManagementAccountNature =
  | "fixa"
  | "variavel";

export interface ManagementAccount {
  id: string;
  user_id: string;
  parent_id: string | null;

  name: string;
  type: ManagementAccountType;
  nature: ManagementAccountNature;

  created_at?: string;
  updated_at?: string;
}

export interface ManagementAccountFormData {
  name: string;
  type: ManagementAccountType | "";
  nature: ManagementAccountNature | "";
  parentId: string;
}

export const ACCOUNT_TYPE_LABELS: Record<ManagementAccountType, string> = {
  receita: "Receita",
  despesa: "Despesa"
};

export const ACCOUNT_NATURE_LABELS: Record<ManagementAccountNature, string> = {
  fixa: "Fixa",
  variavel: "Variável"
};
