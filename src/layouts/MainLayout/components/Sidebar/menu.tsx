import type { ReactNode } from "react";

import {
  Banknote,
  BarChart3,
  Building,
  Building2,
  ClipboardList,
  CreditCard,
  FolderTree,
  HandCoins,
  House,
  Landmark,
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
  { kind: "link", title: "Dashboard", to: "/", icon: <House size={18} />, end: true },
  {
    kind: "group",
    id: "cadastros",
    title: "Cadastros",
    icon: <ClipboardList size={18} />,
    items: [
      { title: "Clientes", to: "/clientes", icon: <Users size={17} /> },
      { title: "Fornecedores", to: "/fornecedores", icon: <Truck size={17} /> },
      { title: "Contas Gerenciais", to: "/contas-gerenciais", icon: <FolderTree size={17} /> }
    ]
  },
  {
    kind: "group",
    id: "financeiro",
    title: "Financeiro",
    icon: <WalletCards size={18} />,
    items: [
      { title: "Contas a Pagar", to: "/contas-pagar", icon: <Wallet size={17} /> },
      { title: "Contas a Receber", to: "/contas-receber", icon: <HandCoins size={17} /> },
      { title: "Caixa", to: "/caixa", icon: <Banknote size={17} /> },
      { title: "Contas Bancárias", to: "/bancos", icon: <Landmark size={17} /> },
      { title: "Cartões de Crédito", to: "/cartoes", icon: <CreditCard size={17} /> }
    ]
  },
  { kind: "link", title: "Relatórios", to: "/relatorios", icon: <BarChart3 size={18} /> },
  {
    kind: "group",
    id: "configuracoes",
    title: "Configurações",
    icon: <Settings size={18} />,
    items: [
      { title: "Minha empresa", to: "/configuracoes/empresa", icon: <Building2 size={17} /> },
      { title: "Usuários e permissões", to: "/configuracoes/usuarios", icon: <UserCog size={17} /> },
      { title: "Meu perfil", to: "/configuracoes/perfil", icon: <UserRound size={17} /> },
      { title: "Empresas", to: "/configuracoes/empresas", icon: <Building size={17} /> }
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
  )
};
