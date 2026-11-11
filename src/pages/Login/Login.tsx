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
  markMustChooseCompany,
  parseCompanyId,
  rememberCompanyId,
  rememberedCompanyId
} from "../../utils/companyLogin";

function Login() {
  const {
    session,
    loading
  } = useAuth();

  const [companyId, setCompanyId] =
    useState(rememberedCompanyId);

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

    // Em branco só para conta que ainda não tem empresa (o banco confere)
    const typedId = companyId.trim();
    const groupId = typedId ? parseCompanyId(typedId) : null;

    if (typedId && !groupId) {
      setErrorMessage("O ID EMPRESA tem só números.");
      return;
    }

    setSubmitting(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (!error) {
      // Confere se a conta tem acesso a este ID e abre ele
      const { data: groupResult, error: groupError } =
        await supabase.rpc("enter_group", {
          p_group_id: groupId
        });

      if (groupError) {
        await supabase.auth.signOut();
        setErrorMessage(
          !groupId
            ? "Informe o ID EMPRESA da sua empresa."
            : /ID EMPRESA/i.test(groupError.message)
              ? "ID EMPRESA incorreto ou sem acesso para este e-mail."
              : "Não foi possível abrir o ID EMPRESA. Tente de novo."
        );
        setSubmitting(false);
        return;
      }

      // Conta sem empresa vai direto criar a primeira (o ID nasce com ela)
      if (groupResult === "ok" && groupId) {
        rememberCompanyId(String(groupId));
      }
      // Depois do login a pessoa escolhe em qual empresa vai operar
      markMustChooseCompany();
      setSubmitting(false);
      return;
    }

    if (error) {
      setErrorMessage(
        translateAuthError(error)
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

  // Durante o login (conferindo o ID) ainda não sai desta tela
  if (session && !submitting) {
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
          <label htmlFor="company-id">
            ID EMPRESA
          </label>

          <input
            id="company-id"
            type="text"
            inputMode="numeric"
            value={companyId}
            onChange={event =>
              setCompanyId(event.target.value.replace(/\D/g, ""))
            }
            autoComplete="organization"
            maxLength={9}
          />
          <small className="login-hint">
            Primeiro acesso, sem empresa ainda? Deixe em branco: você cria a sua e recebe o ID.
          </small>
        </div>

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
