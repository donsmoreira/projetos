import { formatBankLabel } from "../constants/banks";

type AccountLike = {
  name?: string | null;
  bank?: string | null;
  agency?: string | null;
  account_number?: string | null;
};

/**
 * Banco da conta no formato de identificação: "748 - SICREDI".
 * Contas antigas sem banco preenchido usam o nome da conta.
 */
export function formatAccountBank(account: AccountLike | null | undefined): string {
  if (!account) {
    return "";
  }

  return formatBankLabel(
    cleanBankName(account.bank) || cleanBankName(account.name)
  );
}

/**
 * Conta completa para listas de escolha: "748 - SICREDI · Ag. 0101 · Conta 12345-6".
 * Agência e conta ajudam a diferenciar duas contas do mesmo banco.
 */
export function formatAccountLabel(account: AccountLike | null | undefined): string {
  if (!account) {
    return "";
  }

  return [
    formatAccountBank(account),
    account.agency?.trim() ? `Ag. ${account.agency.trim()}` : "",
    account.account_number?.trim() ? `Conta ${account.account_number.trim()}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Devolve só o nome do banco, sem o código numérico (COMPE).
 * "748 - Sicredi" → "Sicredi" · "Sicredi (748)" → "Sicredi" · "001 Banco do Brasil" → "Banco do Brasil"
 * Números colados em letras, como em "C6 Bank", são mantidos.
 */
export function cleanBankName(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\(\s*\d+\s*\)/g, " ")
    .replace(/(?<=^|[\s\-–—:/|,])\d+(?=$|[\s\-–—:/|,])/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:/|,]+|[\s\-–—:/|,]+$/g, "")
    .trim();
}
