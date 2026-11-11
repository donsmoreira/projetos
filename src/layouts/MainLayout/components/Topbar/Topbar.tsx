import { useState } from "react";

import {
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  X
} from "lucide-react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../../../contexts/AuthContext";
import { useCompany } from "../../../../hooks/useCompany";
import { useTheme } from "../../../../hooks/useTheme";
import { PAGE_TITLES } from "../Sidebar/menu";

import "./Topbar.css";

/** Nome da empresa aberta no centro do topo; com mais de uma, vira seletor. */
function CompanySwitcher() {
  const { companies, active, switchCompany } = useCompany();
  const [switching, setSwitching] = useState(false);

  if (!active) {
    return null;
  }

  const label = (item: typeof active) =>
    item.company.trade_name || item.company.name;

  if (companies.length <= 1) {
    return (
      <div className="topbar-company" title="Empresa aberta">
        <Building2 size={16} />
        <span>{label(active)}</span>
      </div>
    );
  }

  return (
    <label className="topbar-company topbar-company-select" title="Trocar de empresa">
      <Building2 size={16} />

      <select
        value={active.company.id}
        disabled={switching}
        aria-label="Empresa aberta"
        onChange={event => {
          setSwitching(true);
          switchCompany(event.target.value).catch(error => {
            window.alert(error instanceof Error ? error.message : "Não foi possível trocar de empresa.");
            setSwitching(false);
          });
        }}
      >
        {companies.map(item => (
          <option key={item.company.id} value={item.company.id}>
            {label(item)}
          </option>
        ))}
      </select>

      <ChevronDown size={15} className="topbar-company-chevron" />
    </label>
  );
}

type TopbarProps = {
  menuCollapsed: boolean;
  mobileMenuOpen: boolean;
  onToggleMenu: () => void;
};

function Topbar({
  menuCollapsed,
  mobileMenuOpen,
  onToggleMenu
}: TopbarProps) {
  const location = useLocation();

  const {
    user,
    signOut
  } = useAuth();

  const {
    theme,
    toggleTheme
  } = useTheme();

  const themeLabel =
    theme === "light"
      ? "Ativar modo escuro"
      : "Ativar modo claro";

  const pageTitle =
    PAGE_TITLES[location.pathname] ??
    "Razão Finance ARC";

  const userName =
    user?.user_metadata?.full_name ||
    user?.email ||
    "Usuário";

  const userInitial =
    userName
      .trim()
      .charAt(0)
      .toUpperCase();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível sair do sistema.";

      window.alert(message);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-start">
        {/* Computador: recolhe/expande o menu. Celular: abre/fecha a gaveta. */}
        <button
          type="button"
          className="topbar-icon-button topbar-menu-button"
          onClick={onToggleMenu}
          aria-controls="menu-principal"
          aria-expanded={mobileMenuOpen}
          title={menuCollapsed ? "Expandir menu" : "Recolher menu"}
          aria-label="Menu"
        >
          <span className="topbar-menu-desktop">
            {menuCollapsed
              ? <PanelLeftOpen size={18} />
              : <PanelLeftClose size={18} />}
          </span>

          <span className="topbar-menu-mobile">
            {mobileMenuOpen
              ? <X size={20} />
              : <Menu size={20} />}
          </span>
        </button>

        <div className="topbar-title">
          <h1>{pageTitle}</h1>

          <p>Razão Finance ARC</p>
        </div>
      </div>

      <div className="topbar-center">
        <CompanySwitcher />
      </div>

      <div className="topbar-user">
        {/* Chave pílula: bolinha à esquerda = modo claro, à direita = modo escuro */}
        <button
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          aria-label="Modo escuro"
          title={themeLabel}
          className="theme-switch"
          onClick={toggleTheme}
        >
          <span
            className="theme-switch-thumb"
            aria-hidden="true"
          />

          <Sun
            size={14}
            className="theme-switch-icon theme-switch-icon-sun"
            aria-hidden="true"
          />

          <Moon
            size={14}
            className="theme-switch-icon theme-switch-icon-moon"
            aria-hidden="true"
          />
        </button>

        <div className="topbar-user-info">
          <span className="topbar-user-name">
            {userName}
          </span>

          <small>Usuário autenticado</small>
        </div>

        <div
          className="topbar-avatar"
          aria-hidden="true"
        >
          {userInitial}
        </div>

        <button
          type="button"
          className="topbar-icon-button"
          onClick={handleSignOut}
          title="Sair do sistema"
          aria-label="Sair do sistema"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

export default Topbar;