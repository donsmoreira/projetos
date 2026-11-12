import type { ReactNode } from "react";

import type { ModuleKey } from "../../../../types/permissions";

import {
  Banknote,
  BarChart3,
  CalendarDays,
  Building2,
  ClipboardList,
  CreditCard,
  FolderTree,
  HandCoins,
  House,
  Landmark,
  LineChart,
  Scale,
  Settings,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
  WalletCards
} from "lucide-react";

export type MenuLink = {
  title: string;
  to: string;
  icon: ReactNode;
  end?: boolean;
  /** Tela com permissão própria: some do menu sem "Ver" */
  module?: ModuleKey;
};

export type MenuGroup = {
  id: string;
  title: string;
  icon: ReactNode;
  items: MenuLink[];
};

export type MenuEntry =
  | ({ kind: "link" } & MenuLink)
  | ({ kind: "group" } & MenuGroup);

/** Menu lateral: telas soltas e grupos com submenus. */
export const MENU: MenuEntry[] = [
  { kind: "link", title: "Dashboard", to: "/", icon: <House size={18} />, end: true, module: "painel" },
  { kind: "link", title: "Agenda", to: "/agenda", icon: <CalendarDays size={18} />, module: "agenda" },
  {
    kind: "group",
    id: "cadastros",
    title: "Cadastros",
    icon: <ClipboardList size={18} />,
    items: [
      { title: "Clientes", to: "/clientes", icon: <Users size={17} />, module: "clientes" },
      { title: "Fornecedores", to: "/fornecedores", icon: <Truck size={17} />, module: "fornecedores" }
    ]
  },
  {
    kind: "group",
    id: "financeiro",
    title: "Financeiro",
    icon: <WalletCards size={18} />,
    items: [
      { title: "Contas a Pagar", to: "/contas-pagar", icon: <Wallet size={17} />, module: "contas_pagar" },
      { title: "Contas a Receber", to: "/contas-receber", icon: <HandCoins size={17} />, module: "contas_receber" },
      { title: "Caixa", to: "/caixa", icon: <Banknote size={17} />, module: "caixa" },
      { title: "Contas Bancárias", to: "/bancos", icon: <Landmark size={17} />, module: "contas_bancarias" },
      { title: "Cartões de Crédito", to: "/cartoes", icon: <CreditCard size={17} />, module: "cartoes" },
      { title: "Contas Gerenciais", to: "/contas-gerenciais", icon: <FolderTree size={17} />, module: "contas_gerenciais" }
    ]
  },
  {
    kind: "group",
    id: "relatorios",
    title: "Relatórios",
    icon: <BarChart3 size={18} />,
    items: [
      { title: "Geral", to: "/relatorios", icon: <LineChart size={17} />, end: true, module: "relatorios" },
      { title: "Quebra de caixa", to: "/relatorios/quebra-de-caixa", icon: <Scale size={17} />, module: "relatorios" }
    ]
  },
  {
    kind: "group",
    id: "configuracoes",
    title: "Configurações",
    icon: <Settings size={18} />,
    items: [
      { title: "Empresas", to: "/configuracoes/empresas", icon: <Building2 size={17} /> },
      { title: "Usuários e permissões", to: "/configuracoes/usuarios", icon: <UserCog size={17} /> },
      { title: "Meu perfil", to: "/configuracoes/perfil", icon: <UserRound size={17} /> }
    ]
  }
];

/** Título de cada tela, para o topo. */
export const PAGE_TITLES: Record<string, string> = {
  "/": "Painel inicial",
  ...Object.fromEntries(
    MENU.flatMap(entry =>
      entry.kind === "link"
        ? [[entry.to, entry.title]]
        : entry.items.map(item => [item.to, item.title])
    ).filter(([to]) => to !== "/")
  ),
  // No menu o item se chama "Geral"; no topo, "Relatórios"
  "/relatorios": "Relatórios"
};

/** Título da tela atual, incluindo as telas com código no endereço. */
export function pageTitleFor(pathname: string): string | undefined {
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }

  if (pathname === "/configuracoes/empresas/nova") {
    return "Nova empresa";
  }

  if (pathname.startsWith("/configuracoes/empresas/")) {
    return "Cadastro da empresa";
  }

  return undefined;
}
