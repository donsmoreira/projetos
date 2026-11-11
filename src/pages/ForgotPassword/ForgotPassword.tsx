import {
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  Link,
  Navigate,
  useNavigate
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

function ForgotPassword() {
  const {
    session,
    loading
  } = useAuth();

  const navigate = useNavigate();

  const [step, setStep] =
    useState<"email" | "reset">("email");

  const [email, setEmail] =
    useState("");

  const [code, setCode] =
    useState("");

  // Depois que o código é aceito, não precisa validar de novo.
  const [codeVerified, setCodeVerified] =
    useState(false);

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [infoMessage, setInfoMessage] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const cooldown = useCooldown();

  async function sendCode(
    targetEmail: string
  ) {
    setErrorMessage("");
    setInfoMessage("");
    setSubmitting(true);

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        targetEmail
      );

    setSubmitting(false);

    if (error) {
      setErrorMessage(
        translateAuthError(error)
      );
      return false;
    }

    setInfoMessage(
      `Se ${targetEmail} estiver cadastrado, você vai receber um código para criar a nova senha.`
    );
    cooldown.start(60);
    return true;
  }

  async function handleRequestCode(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanEmail = email.trim();
    const sent = await sendCode(cleanEmail);

    if (sent) {
      setEmail(cleanEmail);
      setCode("");
      setCodeVerified(false);
      setStep("reset");
    }
  }

  async function handleResetPassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");

    if (!codeVerified && !isValidOtpCode(code)) {
      setErrorMessage(
        "Digite o código completo que chegou no seu e-mail."
      );
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(
        `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
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

    if (!codeVerified) {
      const { error: verifyError } =
        await supabase.auth.verifyOtp({
          email,
          token: code,
          type: "recovery"
        });

      if (verifyError) {
        setSubmitting(false);
        setErrorMessage(
          translateAuthError(verifyError)
        );
        return;
      }

      setCodeVerified(true);
    }

    const { error: updateError } =
      await supabase.auth.updateUser({
        password
      });

    setSubmitting(false);

    if (updateError) {
      setErrorMessage(
        translateAuthError(updateError)
      );
      return;
    }

    navigate("/", { replace: true });
  }

  function handleChangeEmail() {
    setStep("email");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setErrorMessage("");
    setInfoMessage("");
  }

  if (loading) {
    return null;
  }

  // Quem já está logado não precisa recuperar a senha.
  // Na etapa da nova senha a sessão aparece ao validar o código, então não redireciona.
  if (session && step === "email") {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  if (step === "reset") {
    return (
      <AuthLayout
        title="Criar nova senha"
        subtitle="Digite o código recebido e escolha a nova senha."
      >
        <form
          className="login-form"
          onSubmit={handleResetPassword}
        >
          {infoMessage && (
            <p className="login-info">
              {infoMessage}
            </p>
          )}

          {!codeVerified && (
            <div className="login-field">
              <label htmlFor="reset-code">
                Código de verificação
              </label>

              <input
                id="reset-code"
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
          )}

          <div className="login-field">
            <label htmlFor="reset-password">
              Nova senha
            </label>

            <input
              id="reset-password"
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
            <label htmlFor="reset-confirm-password">
              Confirmar nova senha
            </label>

            <input
              id="reset-confirm-password"
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
              ? "Salvando..."
              : "Salvar nova senha"}
          </button>

          {!codeVerified && (
            <div className="login-links">
              <button
                type="button"
                className="login-link-button"
                onClick={() => sendCode(email)}
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
          )}
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueceu a senha?"
      subtitle="Informe seu e-mail para receber um código."
    >
      <form
        className="login-form"
        onSubmit={handleRequestCode}
      >
        <div className="login-field">
          <label htmlFor="forgot-email">
            E-mail
          </label>

          <input
            id="forgot-email"
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

        <p className="login-footer">
          Entra com nome de usuário (sem e-mail)? Peça ao administrador da
          empresa para trocar sua senha em Configurações → Usuários e permissões.
        </p>

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
            ? "Enviando..."
            : "Enviar código"}
        </button>

        <p className="login-footer">
          Lembrou a senha?{" "}
          <Link to="/login">Entrar</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default ForgotPassword;
