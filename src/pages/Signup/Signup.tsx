import {
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  Link,
  Navigate,
  useLocation
} from "react-router-dom";

import { supabase } from "../../services/supabase";
import { useAuth } from "../../contexts/AuthContext";
import AuthLayout from "../../components/AuthLayout/AuthLayout";
import { useCooldown } from "../../hooks/useCooldown";

import {
  MIN_PASSWORD_LENGTH,
  isValidOtpCode,
  sanitizeOtpCode,
  translateAuthError
} from "../../utils/authErrors";

type SignupLocationState = {
  email?: string;
  verify?: boolean;
} | null;

function Signup() {
  const {
    session,
    loading
  } = useAuth();

  const location = useLocation();

  const initialState =
    location.state as SignupLocationState;

  const [step, setStep] =
    useState<"form" | "code">(
      initialState?.verify && initialState.email
        ? "code"
        : "form"
    );

  const [email, setEmail] =
    useState(initialState?.email ?? "");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [code, setCode] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [infoMessage, setInfoMessage] =
    useState(
      initialState?.verify
        ? "Digite o código que enviamos para o seu e-mail ou peça um novo."
        : ""
    );

  const [submitting, setSubmitting] =
    useState(false);

  const cooldown = useCooldown();

  async function handleSignup(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");
    setInfoMessage("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(
        `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(
        "As senhas não são iguais."
      );
      return;
    }

    setSubmitting(true);

    const cleanEmail = email.trim();

    const { data, error } =
      await supabase.auth.signUp({
        email: cleanEmail,
        password
      });

    setSubmitting(false);

    if (error) {
      setErrorMessage(
        translateAuthError(error)
      );
      return;
    }

    // E-mail já confirmado: o Supabase devolve um usuário sem identidades.
    if (data.user?.identities?.length === 0) {
      setErrorMessage(
        "Este e-mail já está cadastrado. Entre com sua senha ou use \"Esqueceu a senha?\"."
      );
      return;
    }

    // Confirmação de e-mail desligada no Supabase: já entra direto.
    if (data.session) {
      return;
    }

    setEmail(cleanEmail);
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setStep("code");
    setInfoMessage(
      `Enviamos um código de verificação para ${cleanEmail}.`
    );
    cooldown.start(60);
  }

  async function handleVerify(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");

    if (!isValidOtpCode(code)) {
      setErrorMessage(
        "Digite o código completo que chegou no seu e-mail."
      );
      return;
    }

    setSubmitting(true);

    const { error } =
      await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "signup"
      });

    setSubmitting(false);

    if (error) {
      setErrorMessage(
        translateAuthError(error)
      );
    }

    // Deu certo: a sessão é criada e o usuário vai para o Dashboard.
  }

  async function handleResend() {
    setErrorMessage("");
    setInfoMessage("");
    setSubmitting(true);

    const { error } =
      await supabase.auth.resend({
        type: "signup",
        email
      });

    setSubmitting(false);

    if (error) {
      setErrorMessage(
        translateAuthError(error)
      );
      return;
    }

    setCode("");
    setInfoMessage(
      `Enviamos um novo código para ${email}.`
    );
    cooldown.start(60);
  }

  function handleChangeEmail() {
    setStep("form");
    setCode("");
    setErrorMessage("");
    setInfoMessage("");
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

  if (step === "code") {
    return (
      <AuthLayout
        title="Confirme seu e-mail"
        subtitle="Digite o código para ativar sua conta."
      >
        <form
          className="login-form"
          onSubmit={handleVerify}
        >
          {infoMessage && (
            <p className="login-info">
              {infoMessage}
            </p>
          )}

          <div className="login-field">
            <label htmlFor="signup-code">
              Código de verificação
            </label>

            <input
              id="signup-code"
              className="login-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={event =>
                setCode(
                  sanitizeOtpCode(event.target.value)
                )
              }
              placeholder="000000"
              autoFocus
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
              ? "Verificando..."
              : "Ativar conta"}
          </button>

          <div className="login-links">
            <button
              type="button"
              className="login-link-button"
              onClick={handleResend}
              disabled={
                submitting ||
                cooldown.secondsLeft > 0
              }
            >
              {cooldown.secondsLeft > 0
                ? `Reenviar código em ${cooldown.secondsLeft}s`
                : "Reenviar código"}
            </button>

            <button
              type="button"
              className="login-link-button"
              onClick={handleChangeEmail}
              disabled={submitting}
            >
              Trocar e-mail
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Cadastre seu e-mail e uma senha."
    >
      <form
        className="login-form"
        onSubmit={handleSignup}
      >
        <div className="login-field">
          <label htmlFor="signup-email">
            E-mail
          </label>

          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={event =>
              setEmail(event.target.value)
            }
            autoComplete="email"
            autoFocus
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="signup-password">
            Senha
          </label>

          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={event =>
              setPassword(event.target.value)
            }
            autoComplete="new-password"
            required
          />

          <small className="login-hint">
            Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
          </small>
        </div>

        <div className="login-field">
          <label htmlFor="signup-confirm-password">
            Confirmar senha
          </label>

          <input
            id="signup-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={event =>
              setConfirmPassword(event.target.value)
            }
            autoComplete="new-password"
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
            ? "Cadastrando..."
            : "Criar conta"}
        </button>

        <p className="login-footer">
          Já tem conta?{" "}
          <Link to="/login">Entrar</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default Signup;
