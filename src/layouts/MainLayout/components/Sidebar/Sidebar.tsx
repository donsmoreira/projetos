import {
  BarChart3,
  CreditCard,
  HandCoins,
  House,
  Landmark,
  Truck,
  Users,
  Wallet
} from "lucide-react";

import SidebarItem from "./SidebarItem";

import "./Sidebar.css";

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h2>Razão ARC</h2>
        <p>Gestão Financeira</p>
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
    </aside>
  );
}

export default Sidebar;