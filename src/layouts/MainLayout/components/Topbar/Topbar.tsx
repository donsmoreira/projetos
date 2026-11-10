import { LogOut, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../../../contexts/AuthContext";
import { useTheme } from "../../../../hooks/useTheme";

import "./Topbar.css";

const pageTitles: Record<string, string> = {
  "/": "Painel inicial",
  "/clientes": "Clientes",
  "/fornecedores": "Fornecedores",
  "/contas-gerenciais": "Contas Gerenciais",
  "/bancos": "Contas Bancárias",
  "/caixa": "Caixa",
  "/contas-pagar": "Contas a Pagar",
  "/contas-receber": "Contas a Receber",
  "/cartoes": "Cartões de Crédito",
  "/relatorios": "Relatórios"
};

function Topbar() {
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
    pageTitles[location.pathname] ??
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
      <div className="topbar-title">
        <h1>{pageTitle}</h1>

        <p>Razão Finance ARC</p>
      </div>

      <div className="topbar-user">
        <button
          type="button"
          className="topbar-icon-button"
          onClick={toggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
        >
          {theme === "light"
            ? <Moon size={18} />
            : <Sun size={18} />}
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