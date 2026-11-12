/** Telas que têm permissão própria (iguais às do banco). */
export type ModuleKey =
  | "painel"
  | "relatorios"
  | "clientes"
  | "fornecedores"
  | "contas_pagar"
  | "contas_receber"
  | "caixa"
  | "contas_bancarias"
  | "cartoes"
  | "contas_gerenciais"
  | "agenda";

/** Ver (a tela aparece), Cadastrar, Alterar, Excluir, Baixar (pagar/receber/estornar) */
export type ModuleAction = "view" | "create" | "update" | "delete" | "settle";

export type ModulePermission = Record<ModuleAction, boolean>;

export type ModulePermissions = Partial<Record<ModuleKey, ModulePermission>>;

export const ACTION_LABELS: Record<ModuleAction, string> = {
  view: "Ver",
  create: "Cadastrar",
  update: "Alterar",
  delete: "Excluir",
  settle: "Baixar"
};

export const ACTION_HINTS: Record<ModuleAction, string> = {
  view: "A tela aparece no menu",
  create: "Incluir novos registros",
  update: "Editar o que já existe",
  delete: "Apagar registros",
  settle: "Pagar, receber e estornar"
};

export const ALL_ACTIONS: ModuleAction[] = ["view", "create", "update", "delete", "settle"];

export type ModuleInfo = {
  key: ModuleKey;
  label: string;
  /** Ações que fazem sentido nesta tela */
  actions: ModuleAction[];
};

export type ModuleSection = {
  /** Subtítulo dentro do grupo (ex.: Lançamentos); null = sem subtítulo */
  title: string | null;
  modules: ModuleInfo[];
};

export type ModuleGroup = {
  title: string;
  sections: ModuleSection[];
};

const CRUD: ModuleAction[] = ["view", "create", "update", "delete"];

/** Grupos e telas, na ordem da tela de permissões. */
export const MODULE_GROUPS: ModuleGroup[] = [
  {
    title: "Geral",
    sections: [
      {
        title: null,
        modules: [
          { key: "painel", label: "Painel inicial", actions: ["view"] },
          { key: "agenda", label: "Agenda", actions: ["view", "create", "update", "delete"] },
          { key: "relatorios", label: "Relatórios", actions: ["view"] }
        ]
      }
    ]
  },
  {
    title: "Cadastros",
    sections: [
      {
        title: null,
        modules: [
          { key: "clientes", label: "Clientes", actions: CRUD },
          { key: "fornecedores", label: "Fornecedores", actions: CRUD }
        ]
      }
    ]
  },
  {
    title: "Financeiro",
    sections: [
      {
        title: "Lançamentos",
        modules: [
          { key: "contas_pagar", label: "Contas a Pagar", actions: ALL_ACTIONS },
          { key: "contas_receber", label: "Contas a Receber", actions: ALL_ACTIONS }
        ]
      },
      {
        title: "Contas e caixa",
        modules: [
          { key: "caixa", label: "Caixa", actions: CRUD },
          { key: "contas_bancarias", label: "Contas Bancárias", actions: CRUD },
          { key: "cartoes", label: "Cartões de Crédito", actions: CRUD },
          { key: "contas_gerenciais", label: "Contas Gerenciais", actions: CRUD }
        ]
      }
    ]
  }
];

export const ALL_MODULES: ModuleInfo[] = MODULE_GROUPS.flatMap(group =>
  group.sections.flatMap(section => section.modules)
);

export const NO_MODULE_PERMISSION: ModulePermission = {
  view: false,
  create: false,
  update: false,
  delete: false,
  settle: false
};

/** Todas as telas com as ações escolhidas (respeitando o que cada tela tem). */
export function modulePermissionsWith(actions: ModuleAction[]): ModulePermissions {
  return Object.fromEntries(
    ALL_MODULES.map(module => [
      module.key,
      Object.fromEntries(
        ALL_ACTIONS.map(action => [
          action,
          module.actions.includes(action) && actions.includes(action)
        ])
      ) as ModulePermission
    ])
  );
}

/** Marca/desmarca uma ação: marcar qualquer uma marca "Ver"; desmarcar "Ver" limpa as outras. */
export function toggleModuleAction(
  permissions: ModulePermissions,
  module: ModuleInfo,
  action: ModuleAction
): ModulePermissions {
  const current = permissions[module.key] ?? NO_MODULE_PERMISSION;
  const value = !current[action];
  let next: ModulePermission = { ...current, [action]: value };

  if (action === "view" && !value) {
    next = { ...NO_MODULE_PERMISSION };
  } else if (action !== "view" && value) {
    next.view = true;
  }

  return { ...permissions, [module.key]: next };
}

/** Marca ou desmarca todas as ações de uma tela. */
export function setModuleAll(
  permissions: ModulePermissions,
  module: ModuleInfo,
  value: boolean
): ModulePermissions {
  return {
    ...permissions,
    [module.key]: Object.fromEntries(
      ALL_ACTIONS.map(action => [action, value && module.actions.includes(action)])
    ) as ModulePermission
  };
}

export function sameModulePermissions(a: ModulePermissions, b: ModulePermissions): boolean {
  return ALL_MODULES.every(module =>
    ALL_ACTIONS.every(
      action =>
        Boolean(a[module.key]?.[action]) === Boolean(b[module.key]?.[action])
    )
  );
}

/** Resumo curto: "Ver 10 telas · cadastrar em 6 · baixar em 2". */
export function describeModulePermissions(permissions: ModulePermissions): string {
  const count = (action: ModuleAction) =>
    ALL_MODULES.filter(module => permissions[module.key]?.[action]).length;

  const views = count("view");

  if (views === 0) {
    return "Nenhuma tela";
  }

  const parts = [`Ver ${views} ${views === 1 ? "tela" : "telas"}`];

  (["create", "update", "delete", "settle"] as ModuleAction[]).forEach(action => {
    const total = count(action);

    if (total > 0) {
      parts.push(`${ACTION_LABELS[action].toLowerCase()} em ${total}`);
    }
  });

  return parts.join(" · ");
}
