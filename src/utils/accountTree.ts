import type {
  ManagementAccount
} from "../types/managementAccount";

export type AccountNode = {
  account: ManagementAccount;
  children: AccountNode[];
  depth: number;
};

export type FlatAccountOption = {
  account: ManagementAccount;
  depth: number;
  path: string;
};

export const PATH_SEPARATOR = " › ";

function compareByName(
  a: ManagementAccount,
  b: ManagementAccount
) {
  return a.name.localeCompare(b.name, "pt-BR", {
    sensitivity: "base",
    numeric: true
  });
}

/**
 * Monta a árvore pai → filhas, em ordem alfabética em cada nível.
 * Conta cujo pai não está na lista vira conta principal (não some da tela).
 */
export function buildAccountTree(
  accounts: ManagementAccount[]
): AccountNode[] {
  const ids = new Set(accounts.map(account => account.id));
  const childrenByParent = new Map<string | null, ManagementAccount[]>();

  for (const account of accounts) {
    const parentKey =
      account.parent_id && ids.has(account.parent_id)
        ? account.parent_id
        : null;

    const list = childrenByParent.get(parentKey) ?? [];
    list.push(account);
    childrenByParent.set(parentKey, list);
  }

  const visited = new Set<string>();

  function build(
    parentKey: string | null,
    depth: number
  ): AccountNode[] {
    const list = [...(childrenByParent.get(parentKey) ?? [])]
      .sort(compareByName);

    return list
      .filter(account => !visited.has(account.id))
      .map(account => {
        visited.add(account.id);

        return {
          account,
          depth,
          children: build(account.id, depth + 1)
        };
      });
  }

  return build(null, 0);
}

/**
 * Ids de todas as contas abaixo da conta informada (filhas, netas...).
 */
export function getDescendantIds(
  accounts: ManagementAccount[],
  id: string
): Set<string> {
  const result = new Set<string>();
  const queue = [id];

  while (queue.length > 0) {
    const current = queue.shift() as string;

    for (const account of accounts) {
      if (
        account.parent_id === current &&
        !result.has(account.id) &&
        account.id !== id
      ) {
        result.add(account.id);
        queue.push(account.id);
      }
    }
  }

  return result;
}

/**
 * Caminho completo da conta, ex.: "RECEITA TRABALHO › Empresa X".
 */
export function getAccountPath(
  accounts: ManagementAccount[],
  id: string
): string {
  const byId = new Map(accounts.map(account => [account.id, account]));
  const names: string[] = [];
  const seen = new Set<string>();

  let current = byId.get(id);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parent_id
      ? byId.get(current.parent_id)
      : undefined;
  }

  return names.join(PATH_SEPARATOR);
}

/**
 * Lista a árvore em ordem (pai seguido das filhas), para usar em <select>.
 */
export function flattenAccountTree(
  nodes: AccountNode[],
  parentPath = ""
): FlatAccountOption[] {
  const result: FlatAccountOption[] = [];

  for (const node of nodes) {
    const path = parentPath
      ? `${parentPath}${PATH_SEPARATOR}${node.account.name}`
      : node.account.name;

    result.push({
      account: node.account,
      depth: node.depth,
      path
    });

    result.push(
      ...flattenAccountTree(node.children, path)
    );
  }

  return result;
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra a árvore pelo texto: mantém as contas que batem e o caminho até elas.
 * Se a conta pai bate, as filhas continuam aparecendo.
 */
export function filterAccountTree(
  nodes: AccountNode[],
  term: string
): AccountNode[] {
  const search = normalize(term);

  if (!search) {
    return nodes;
  }

  const result: AccountNode[] = [];

  for (const node of nodes) {
    if (normalize(node.account.name).includes(search)) {
      result.push(node);
      continue;
    }

    const children = filterAccountTree(node.children, term);

    if (children.length > 0) {
      result.push({
        ...node,
        children
      });
    }
  }

  return result;
}

/**
 * Já existe outra conta com o mesmo nome no mesmo nível?
 */
export function hasSiblingWithName(
  accounts: ManagementAccount[],
  name: string,
  parentId: string | null,
  ignoreId?: string
): boolean {
  const target = normalize(name);

  return accounts.some(account =>
    account.id !== ignoreId &&
    (account.parent_id ?? null) === (parentId ?? null) &&
    normalize(account.name) === target
  );
}

export function countDescendants(node: AccountNode): number {
  return node.children.reduce(
    (total, child) => total + 1 + countDescendants(child),
    0
  );
}
