/**
 * Login por nome de usuário.
 * O Supabase só aceita e-mail, então "joao" vira o e-mail interno
 * "joao@usuario.razao-finance.local" (nunca recebe mensagens). O mesmo domínio
 * está na função supabase/functions/admin-users.
 */
export const USERNAME_DOMAIN = "usuario.razao-finance.local";

const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

/** "João.Silva " → "joão.silva" (só tira espaços e passa para minúsculas) */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Sem "@" é nome de usuário; com "@" é e-mail. */
export function isUsernameLogin(value: string): boolean {
  return !value.includes("@");
}

/** O que digitou no login → e-mail que o Supabase entende. */
export function loginToEmail(value: string): string {
  const typed = value.trim();
  return isUsernameLogin(typed) ? `${normalizeUsername(typed)}@${USERNAME_DOMAIN}` : typed;
}

/** É uma conta criada com nome de usuário? */
export function isUsernameAccount(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`));
}

/** E-mail interno → "joao"; e-mail de verdade fica igual. */
export function displayLogin(email: string | null | undefined): string {
  if (!email) {
    return "";
  }

  return isUsernameAccount(email) ? email.slice(0, email.indexOf("@")) : email;
}

/** Erro de preenchimento do nome de usuário ("" = tudo certo). */
export function validateUsername(value: string): string {
  const username = normalizeUsername(value);

  if (!username) {
    return "Informe o nome de usuário.";
  }

  if (!USERNAME_RULE.test(username)) {
    return "Usuário: de 3 a 30 letras minúsculas sem acento, números, ponto, hífen ou sublinhado, começando com letra ou número.";
  }

  return "";
}
