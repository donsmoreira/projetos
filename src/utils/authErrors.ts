type AuthErrorLike = {
  message?: string;
  code?: string;
};

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Traduz os erros do Supabase Auth para mensagens em português.
 */
export function translateAuthError(
  error: AuthErrorLike | null | undefined
): string {
  if (!error) {
    return "";
  }

  const code = error.code ?? "";
  const message = error.message ?? "";

  const waitMatch = message.match(
    /after (\d+) seconds?/i
  );

  if (waitMatch) {
    return `Aguarde ${waitMatch[1]} segundos para pedir um novo código.`;
  }

  if (
    code === "invalid_credentials" ||
    message === "Invalid login credentials"
  ) {
    return "E-mail ou senha incorretos.";
  }

  if (
    code === "email_not_confirmed" ||
    /email not confirmed/i.test(message)
  ) {
    return "Seu e-mail ainda não foi confirmado.";
  }

  if (
    code === "otp_expired" ||
    /token has expired or is invalid/i.test(message)
  ) {
    return "Código inválido ou expirado. Confira o código ou peça um novo.";
  }

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    /already registered/i.test(message)
  ) {
    return "Este e-mail já está cadastrado.";
  }

  if (
    code === "weak_password" ||
    /password should be/i.test(message)
  ) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (
    code === "same_password" ||
    /different from the old password/i.test(message)
  ) {
    return "A nova senha precisa ser diferente da senha atual.";
  }

  if (
    code === "over_email_send_rate_limit" ||
    /rate limit/i.test(message)
  ) {
    return "Muitos e-mails enviados em pouco tempo. Tente novamente mais tarde.";
  }

  if (
    code === "email_address_invalid" ||
    /invalid format|is invalid/i.test(message)
  ) {
    return "E-mail inválido.";
  }

  if (
    code === "signup_disabled" ||
    /signups not allowed/i.test(message)
  ) {
    return "O cadastro de novos usuários está desativado.";
  }

  if (/failed to fetch|network/i.test(message)) {
    return "Sem conexão com o servidor. Verifique sua internet.";
  }

  return message || "Não foi possível concluir. Tente novamente.";
}

/**
 * Mantém só os dígitos do código digitado (o Supabase envia de 6 a 10 dígitos).
 */
export function sanitizeOtpCode(text: string): string {
  return text.replace(/\D/g, "").slice(0, 10);
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6,10}$/.test(code);
}
