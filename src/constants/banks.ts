// Bancos, cooperativas e contas digitais do Brasil.
// Códigos COMPE conferidos na lista do Banco Central (via BrasilAPI) em 10/11/2026.
export const BANKS = [
  { code: "121", name: "Agibank" },
  { code: "085", name: "Ailos" },
  { code: "003", name: "Banco da Amazônia" },
  { code: "001", name: "Banco do Brasil" },
  { code: "004", name: "Banco do Nordeste" },
  { code: "389", name: "Banco Mercantil" },
  { code: "623", name: "Banco Pan" },
  { code: "047", name: "Banese" },
  { code: "021", name: "Banestes" },
  { code: "037", name: "Banpará" },
  { code: "041", name: "Banrisul" },
  { code: "318", name: "BMG" },
  { code: "237", name: "Bradesco" },
  { code: "070", name: "BRB" },
  { code: "208", name: "BTG Pactual" },
  { code: "655", name: "BV" },
  { code: "336", name: "C6 Bank" },
  { code: "104", name: "Caixa Econômica Federal" },
  { code: "403", name: "Cora" },
  { code: "133", name: "Cresol" },
  { code: "707", name: "Daycoval" },
  { code: "542", name: "InfinitePay" },
  { code: "077", name: "Inter" },
  { code: "341", name: "Itaú" },
  { code: "323", name: "Mercado Pago" },
  { code: "536", name: "Neon" },
  { code: "237", name: "Next" },
  { code: "260", name: "Nubank" },
  { code: "212", name: "Original" },
  { code: "290", name: "PagBank" },
  { code: "380", name: "PicPay" },
  { code: "422", name: "Safra" },
  { code: "033", name: "Santander" },
  { code: "756", name: "Sicoob" },
  { code: "748", name: "Sicredi" },
  { code: "637", name: "Sofisa" },
  { code: "197", name: "Stone" },
  { code: "136", name: "Unicred" },
  { code: "102", name: "XP" }
] as const;

function normalizeForCompare(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function findBankEntry(name: string | null | undefined) {
  const target = normalizeForCompare(name ?? "");

  if (!target) {
    return null;
  }

  return (
    BANKS.find(
      bank => normalizeForCompare(bank.name) === target
    ) ?? null
  );
}

/**
 * Procura um nome na lista ignorando maiúsculas e acentos ("itau" → "Itaú").
 * Devolve o nome como está na lista, ou null se não encontrar.
 */
export function findBank(name: string | null | undefined): string | null {
  return findBankEntry(name)?.name ?? null;
}

/**
 * Rótulo para o usuário identificar o banco: "748 - SICREDI".
 * Banco fora da lista aparece só com o nome, em maiúsculas.
 */
export function formatBankLabel(name: string | null | undefined): string {
  const entry = findBankEntry(name);

  if (entry) {
    return `${entry.code} - ${entry.name.toUpperCase()}`;
  }

  return (name ?? "").trim().toUpperCase();
}
