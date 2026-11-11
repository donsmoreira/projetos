/**
 * ID EMPRESA do login e a escolha da empresa logo depois de entrar.
 * Tudo no navegador; se o navegador bloquear, só não lembra.
 */
const ID_KEY = "arc-id-empresa";
const CHOOSE_KEY = "arc-escolher-empresa";

/** Último ID EMPRESA digitado (para já vir preenchido). */
export function rememberedCompanyId(): string {
  try {
    return localStorage.getItem(ID_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberCompanyId(value: string) {
  try {
    localStorage.setItem(ID_KEY, value);
  } catch {
    // navegador sem armazenamento: só não lembra
  }
}

/** Marca que, depois do login, a pessoa precisa escolher a empresa. */
export function markMustChooseCompany() {
  try {
    sessionStorage.setItem(CHOOSE_KEY, "1");
  } catch {
    // sem armazenamento: a escolha aparece só quando não houver empresa aberta
  }
}

export function mustChooseCompany(): boolean {
  try {
    return sessionStorage.getItem(CHOOSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearMustChooseCompany() {
  try {
    sessionStorage.removeItem(CHOOSE_KEY);
  } catch {
    // nada a fazer
  }
}

/** "2" → 2; vazio ou inválido → null */
export function parseCompanyId(value: string): number | null {
  const digits = value.trim();

  if (!/^\d{1,9}$/.test(digits)) {
    return null;
  }

  const id = Number(digits);
  return id >= 1 ? id : null;
}
