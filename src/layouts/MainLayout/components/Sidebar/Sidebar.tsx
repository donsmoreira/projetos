import { useState } from "react";
import { useLocation } from "react-router-dom";

import { ChevronDown } from "lucide-react";

import SidebarItem from "./SidebarItem";
import ArcMark from "../../../../components/ArcMark/ArcMark";
import { MENU } from "./menu";

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
  const location = useLocation();

  // Grupo aberto/fechado pela pessoa; se não mexeu, abre o grupo da tela atual
  const [openGroups, setOpenGroups] =
    useState<Record<string, boolean>>({});

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
        {MENU.map(entry => {
          if (entry.kind === "link") {
            return (
              <SidebarItem
                key={entry.to}
                {...itemProps}
                icon={entry.icon}
                title={entry.title}
                to={entry.to}
                end={entry.end}
              />
            );
          }

          const containsCurrent = entry.items.some(item =>
            location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
          );
          const open = openGroups[entry.id] ?? containsCurrent;

          return (
            <div
              key={entry.id}
              className={[
                "sidebar-group",
                open ? "is-open" : "",
                containsCurrent ? "has-current" : ""
              ].join(" ")}
            >
              <button
                type="button"
                className="sidebar-group-header"
                aria-expanded={open}
                aria-label={entry.title}
                title={collapsed ? entry.title : undefined}
                onClick={() =>
                  setOpenGroups(current => ({ ...current, [entry.id]: !open }))
                }
              >
                <span className="sidebar-icon">{entry.icon}</span>
                <span className="sidebar-item-label">{entry.title}</span>
                <ChevronDown size={15} className="sidebar-group-chevron" />
              </button>

              <div className="sidebar-group-items">
                {entry.items.map(item => (
                  <SidebarItem
                    key={item.to}
                    {...itemProps}
                    icon={item.icon}
                    title={item.title}
                    to={item.to}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <footer className="sidebar-footer">
        <span className="sidebar-footer-brand">D&amp;C · Donovan &amp; Christopher</span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </aside>
  );
}

export default Sidebar;
