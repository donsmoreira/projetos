import {
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  Navigate
} from "react-router-dom";

import { supabase } from "../../services/supabase";
import { useAuth } from "../../contexts/AuthContext";

import "./Login.css";

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

  const [submitting, setSubmitting] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSubmitting(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (error) {
      setErrorMessage(
        error.message ===
          "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message
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
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">
            R
          </span>

          <div>
            <strong>
              Razão Finance ARC
            </strong>

            <small>
              Gestão financeira
            </small>
          </div>
        </div>

        <div className="login-heading">
          <h1>Entrar</h1>

          <p>
            Acesse seus dados financeiros.
          </p>
        </div>

        <form
          className="login-form"
          onSubmit={handleSubmit}
        >
          <div className="login-field">
            <label htmlFor="email">
              E-mail
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={event =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">
              Senha
            </label>

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
        </form>
      </section>
    </main>
  );
}

export default Login;