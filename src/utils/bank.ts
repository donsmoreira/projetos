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
