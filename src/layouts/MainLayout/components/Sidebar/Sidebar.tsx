import {
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

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <ArcMark
          size={42}
          className="sidebar-logo-mark"
        />

        <div>
          <h2>Razão Finance</h2>
          <p>
            <span>ARC</span> · Gestão financeira
          </p>
        </div>
      </div>

      <nav className="sidebar-menu">
        <SidebarItem
          icon={<House size={18} />}
          title="Dashboard"
          to="/"
          end
        />

        <SidebarItem
          icon={<Users size={18} />}
          title="Clientes"
          to="/clientes"
        />

        <SidebarItem
          icon={<Truck size={18} />}
          title="Fornecedores"
          to="/fornecedores"
        />

        <SidebarItem
          icon={<FolderTree size={18} />}
          title="Contas Gerenciais"
          to="/contas-gerenciais"
        />

        <SidebarItem
          icon={<Landmark size={18} />}
          title="Contas Bancárias"
          to="/bancos"
        />

        <SidebarItem
          icon={<Wallet size={18} />}
          title="Contas a Pagar"
          to="/contas-pagar"
        />

        <SidebarItem
          icon={<HandCoins size={18} />}
          title="Contas a Receber"
          to="/contas-receber"
        />

        <SidebarItem
          icon={<CreditCard size={18} />}
          title="Cartões de Crédito"
          to="/cartoes"
        />

        <SidebarItem
          icon={<BarChart3 size={18} />}
          title="Relatórios"
          to="/relatorios"
        />
      </nav>

      <footer className="sidebar-footer">
        <span>D&amp;C · Donovan &amp; Christopher</span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </aside>
  );
}

export default Sidebar;