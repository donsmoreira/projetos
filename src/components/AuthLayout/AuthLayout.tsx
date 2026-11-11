import type {
  ReactNode
} from "react";

import arcLogo from "../../assets/arc-logo.png";

import "../../pages/Login/Login.css";

type AuthLayoutProps = {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  /** Cartão largo (formulários grandes, como o cadastro da primeira empresa) */
  wide?: boolean;
};

/**
 * Moldura das telas sem login: Entrar, Cadastro e Esqueceu a senha.
 */
function AuthLayout({
  title,
  subtitle,
  children,
  wide = false
}: AuthLayoutProps) {
  return (
    <main className="login-page">
      <section className={wide ? "login-card login-card-wide" : "login-card"}>
        <div className="login-brand">
          <img
            src={arcLogo}
            alt="ARC — Análises Reais e Computacionais"
            className="login-brand-logo"
          />

          <strong>
            Razão Finance
          </strong>

          <small>
            Gestão financeira
          </small>
        </div>

        <div className="login-heading">
          <h1>{title}</h1>

          <p>{subtitle}</p>
        </div>

        {children}
      </section>
    </main>
  );
}

export default AuthLayout;
