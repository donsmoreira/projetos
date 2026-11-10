import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import "./SidebarItem.css";

type SidebarItemProps = {
  icon: ReactNode;
  title: string;
  to: string;
  end?: boolean;
};

function SidebarItem({
  icon,
  title,
  to,
  end = false
}: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `sidebar-item ${isActive ? "active" : ""}`
      }
    >
      <span className="sidebar-icon">
        {icon}
      </span>

      <span>{title}</span>
    </NavLink>
  );
}

export default SidebarItem;