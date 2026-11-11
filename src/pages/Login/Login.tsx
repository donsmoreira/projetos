import {
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  Link,
  Navigate
} from "react-router-dom";

import { supabase } from "../../services/supabase";
import { useAuth } from "../../contexts/AuthContext";
import AuthLayout from "../../components/AuthLayout/AuthLayout";
import { translateAuthError } from "../../utils/authErrors";
import {
  isUsernameLogin,
  loginToEmail
} from "../../utils/username";

function Login() {
  const {
    session,
    loading
  } = useAuth();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [emailNotConfirmed, setEmailNotConfirmed] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");
    setEmailNotConfirmed(false);
    setSubmitting(true);

    // Sem "@" é nome de usuário: vira o e-mail interno da conta
    const byUsername = isUsernameLogin(email.trim());

    const { error } =
      await supabase.auth.signInWithPassword({
        email: loginToEmail(email),
        password
      });

    if (error) {
      setErrorMessage(
        byUsername && /invalid login credentials/i.test(error.message)
          ? "Usuário ou senha incorretos."
          : translateAuthError(error)
      );

      setEmailNotConfirmed(
        error.code === "email_not_confirmed" ||
        /email not confirmed/i.test(error.message)
      );

      setSubmitting(false);
    }
  }

  if (loading) {
    return null;
  }

  if (session) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse seus dados financeiros."
    >
      <form
        className="login-form"
        onSubmit={handleSubmit}
      >
        <div className="login-field">
          <label htmlFor="email">
            E-mail ou usuário
          </label>

          <input
            id="email"
            type="text"
            value={email}
            onChange={event =>
              setEmail(event.target.value)
            }
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>

        <div className="login-field">
          <div className="login-label-row">
            <label htmlFor="password">
              Senha
            </label>

            <Link
              to="/esqueci-senha"
              className="login-small-link"
            >
              Esqueceu a senha?
            </Link>
          </div>

          <input
            id="password"
            type="password"
            value={password}
            onChange={event =>
              setPassword(event.target.value)
            }
            autoComplete="current-password"
            required
          />
        </div>

        {errorMessage && (
          <p className="login-error">
            {errorMessage}

            {emailNotConfirmed && (
              <>
                {" "}
                <Link
                  to="/cadastro"
                  state={{
                    email: email.trim(),
                    verify: true
                  }}
                >
                  Confirmar meu e-mail
                </Link>
              </>
            )}
          </p>
        )}

        <button
          type="submit"
          className="login-button"
          disabled={submitting}
        >
          {submitting
            ? "Entrando..."
            : "Entrar"}
        </button>

        <p className="login-footer">
          Não tem conta?{" "}
          <Link to="/cadastro">Criar conta</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default Login;
