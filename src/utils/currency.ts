/**
 * Máscara de valor em reais para campos de digitação.
 * O usuário digita só números e eles preenchem da direita para a esquerda:
 * "5" → 0,05 · "500000" → 5.000,00
 */
export function formatCurrencyInput(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function parseCurrencyInput(text: string): number {
  const digits = text.replace(/\D/g, "");

  return digits ? Number(digits) / 100 : 0;
}
