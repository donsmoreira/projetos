import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import "./SidebarItem.css";

type SidebarItemProps = {
  icon: ReactNode;
  title: string;
  to: string;
  end?: boolean;
  /** Menu recolhido: o nome aparece só ao passar o mouse */
  collapsed?: boolean;
  onNavigate?: () => void;
};

function SidebarItem({
  icon,
  title,
  to,
  end = false,
  collapsed = false,
  onNavigate
}: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? title : undefined}
      aria-label={title}
      onClick={onNavigate}
      className={({ isActive }) =>
        `sidebar-item ${isActive ? "active" : ""}`
      }
    >
      <span className="sidebar-icon">
        {icon}
      </span>

      <span className="sidebar-item-label">{title}</span>
    </NavLink>
  );
}

export default SidebarItem;
