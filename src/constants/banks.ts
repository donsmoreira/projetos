// Bancos, cooperativas e contas digitais do Brasil (só o nome, sem código)
export const BANKS = [
  "Agibank",
  "Ailos",
  "Banco da Amazônia",
  "Banco do Brasil",
  "Banco do Nordeste",
  "Banco Mercantil",
  "Banco Pan",
  "Banese",
  "Banestes",
  "Banpará",
  "Banrisul",
  "BMG",
  "Bradesco",
  "BRB",
  "BTG Pactual",
  "BV",
  "C6 Bank",
  "Caixa Econômica Federal",
  "Cora",
  "Cresol",
  "Daycoval",
  "InfinitePay",
  "Inter",
  "Itaú",
  "Mercado Pago",
  "Neon",
  "Next",
  "Nubank",
  "Original",
  "PagBank",
  "PicPay",
  "Safra",
  "Santander",
  "Sicoob",
  "Sicredi",
  "Sofisa",
  "Stone",
  "Unicred",
  "Will Bank",
  "XP"
] as const;

function normalizeForCompare(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Procura um nome na lista ignorando maiúsculas e acentos ("itau" → "Itaú").
 * Devolve o nome como está na lista, ou null se não encontrar.
 */
export function findBank(name: string): string | null {
  const target = normalizeForCompare(name);

  if (!target) {
    return null;
  }

  return (
    BANKS.find(
      bank => normalizeForCompare(bank) === target
    ) ?? null
  );
}
