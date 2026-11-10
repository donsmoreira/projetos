/**
 * Valor em reais no formato de exibição dos campos: 5000 → "5.000,00".
 */
export function formatCurrencyInput(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Remove o que não pode existir num valor digitado.
 * Mantém dígitos, ponto (milhar) e vírgula (centavos) exatamente onde estão,
 * para o cursor não pular ao editar qualquer posição do número.
 */
export function sanitizeCurrencyText(text: string): string {
  return text.replace(/[^\d.,]/g, "");
}

/**
 * Aplica uma edição feita no campo de valor e devolve o texto final e onde o
 * cursor deve ficar. Regras:
 * - só ficam dígitos, ponto e uma única vírgula (uma segunda vírgula digitada é ignorada);
 * - no máximo 2 casas de centavos: digitar numa casa de centavo substitui o
 *   dígito seguinte, em vez de criar uma terceira casa;
 * - o cursor continua no mesmo ponto do número, mesmo quando algo é recusado.
 */
export function applyCurrencyEdit(
  raw: string,
  rawCursor: number
): { text: string; cursor: number } {
  const commaPositions = [...raw]
    .map((char, index) => (char === "," ? index : -1))
    .filter(index => index !== -1);

  // Com duas vírgulas, a recém-digitada (antes do cursor) sai; senão, sai a última
  const droppedComma =
    commaPositions.length > 1
      ? commaPositions.includes(rawCursor - 1)
        ? rawCursor - 1
        : commaPositions[commaPositions.length - 1]
      : -1;

  let text = "";
  let cursor = 0;

  [...raw].forEach((char, index) => {
    const keep =
      /[\d.,]/.test(char) &&
      index !== droppedComma &&
      !(char === "," && text.includes(","));

    if (keep) {
      text += char;

      if (index < rawCursor) {
        cursor++;
      }
    }
  });

  const commaIndex = text.indexOf(",");

  if (commaIndex !== -1) {
    const maxLength = commaIndex + 3;

    while (text.length > maxLength) {
      // Cursor dentro dos centavos e com dígito à frente: substitui esse dígito
      if (cursor > commaIndex && cursor < text.length) {
        text = text.slice(0, cursor) + text.slice(cursor + 1);
      } else {
        text = text.slice(0, maxLength);
        cursor = Math.min(cursor, maxLength);
      }
    }
  }

  return { text, cursor };
}

/**
 * Converte o texto digitado em número, arredondado em centavos.
 * Ponto é separador de milhar e é ignorado; a primeira vírgula separa os centavos.
 * Sem vírgula, um ponto final seguido de 1 ou 2 dígitos vale como centavos
 * (quem digita "5000.50" quer 5.000,50, não 500.050).
 * "5.000,00" → 5000 · "5000" → 5000 · "1.234,5" → 1234.5 · "5000.50" → 5000.5 · "" → 0
 */
export function parseCurrencyText(text: string): number {
  let sanitized = sanitizeCurrencyText(text);

  if (!sanitized.includes(",")) {
    sanitized = sanitized.replace(
      /\.(\d{1,2})$/,
      ",$1"
    );
  }

  const clean = sanitized.replace(/\./g, "");
  const commaIndex = clean.indexOf(",");

  const integerDigits =
    commaIndex === -1 ? clean : clean.slice(0, commaIndex);

  const decimalDigits =
    commaIndex === -1
      ? ""
      : clean.slice(commaIndex + 1).replace(/,/g, "");

  const value = Number(
    `${integerDigits || "0"}.${decimalDigits || "0"}`
  );

  return Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : 0;
}
