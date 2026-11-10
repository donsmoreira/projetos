import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "./components/Sidebar/Sidebar";
import Topbar from "./components/Topbar/Topbar";

import "./MainLayout.css";

const COLLAPSED_KEY = "arc-menu-recolhido";

/** Mesma largura do @media do CSS: abaixo disso o menu vira gaveta. */
const MOBILE_QUERY = "(max-width: 768px)";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function MainLayout() {
  // Computador: menu recolhido (só ícones). Fica salvo no navegador.
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Celular: gaveta aberta por cima da tela.
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
  }, []);

  function toggleMenu() {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setMobileOpen(open => !open);
      return;
    }

    setCollapsed(current => {
      const next = !current;

      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Sem armazenamento: vale só até fechar a aba
      }

      return next;
    });
  }

  // Gaveta aberta: Esc fecha
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [mobileOpen]);

  return (
    <div
      className={[
        "layout",
        collapsed ? "menu-collapsed" : "",
        mobileOpen ? "menu-mobile-open" : ""
      ].join(" ")}
    >
      <Sidebar
        collapsed={collapsed}
        onNavigate={closeMobileMenu}
      />

      {/* Fundo escuro atrás da gaveta no celular: clicar fecha */}
      <div
        className="layout-backdrop"
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      <div className="layout-content">
        <Topbar
          menuCollapsed={collapsed}
          mobileMenuOpen={mobileOpen}
          onToggleMenu={toggleMenu}
        />

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
