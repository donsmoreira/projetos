/** "010701" → "01.07.01" (código de tributação nacional; formata enquanto digita) */
export function formatNationalCode(value: string | null | undefined) {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 6);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)].filter(Boolean).join(".");
}

/** "101010000" → "1.0101.00.00" (código NBS) */
export function formatNbs(value: string | null | undefined) {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 9);
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(".");
}

/** "6201501" → "6201-5/01" */
export function formatCnaeCode(value: string | null | undefined) {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 7);
  if (d.length <= 4) return d;
  if (d.length === 5) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`;
}

/** 5 → "5%" · 2.5 → "2,5%" */
export function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
