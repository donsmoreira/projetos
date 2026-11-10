import {
  Banknote,
  BarChart3,
  CreditCard,
  FolderTree,
  HandCoins,
  House,
  Landmark,
  Truck,
  Users,
  Wallet
} from "lucide-react";

import SidebarItem from "./SidebarItem";
import ArcMark from "../../../../components/ArcMark/ArcMark";

import "./Sidebar.css";

type SidebarProps = {
  /** Computador: mostra só os ícones */
  collapsed: boolean;
  /** Chamado ao escolher uma tela (fecha a gaveta no celular) */
  onNavigate: () => void;
};

function Sidebar({
  collapsed,
  onNavigate
}: SidebarProps) {
  const itemProps = {
    collapsed,
    onNavigate
  };

  return (
    <aside
      id="menu-principal"
      className="sidebar"
    >
      <div className="sidebar-logo">
        <ArcMark
          size={42}
          className="sidebar-logo-mark"
        />

        <div className="sidebar-logo-text">
          <h2>Razão Finance</h2>
          <p>
            <span>ARC</span> · Gestão financeira
          </p>
        </div>
      </div>

      <nav className="sidebar-menu">
        <SidebarItem
          {...itemProps}
          icon={<House size={18} />}
          title="Dashboard"
          to="/"
          end
        />

        <SidebarItem
          {...itemProps}
          icon={<Users size={18} />}
          title="Clientes"
          to="/clientes"
        />

        <SidebarItem
          {...itemProps}
          icon={<Truck size={18} />}
          title="Fornecedores"
          to="/fornecedores"
        />

        <SidebarItem
          {...itemProps}
          icon={<FolderTree size={18} />}
          title="Contas Gerenciais"
          to="/contas-gerenciais"
        />

        <SidebarItem
          {...itemProps}
          icon={<Landmark size={18} />}
          title="Contas Bancárias"
          to="/bancos"
        />

        <SidebarItem
          {...itemProps}
          icon={<Banknote size={18} />}
          title="Caixa"
          to="/caixa"
        />

        <SidebarItem
          {...itemProps}
          icon={<Wallet size={18} />}
          title="Contas a Pagar"
          to="/contas-pagar"
        />

        <SidebarItem
          {...itemProps}
          icon={<HandCoins size={18} />}
          title="Contas a Receber"
          to="/contas-receber"
        />

        <SidebarItem
          {...itemProps}
          icon={<CreditCard size={18} />}
          title="Cartões de Crédito"
          to="/cartoes"
        />

        <SidebarItem
          {...itemProps}
          icon={<BarChart3 size={18} />}
          title="Relatórios"
          to="/relatorios"
        />
      </nav>

      <footer className="sidebar-footer">
        <span className="sidebar-footer-brand">D&amp;C · Donovan &amp; Christopher</span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </aside>
  );
}

export default Sidebar;