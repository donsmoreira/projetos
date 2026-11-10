/**
 * Cores dos gráficos ARC — as mesmas no modo escuro (#0b1220) e no claro (#ffffff).
 * Ordem fixa e validada para daltonismo e contraste (dataviz validate_palette, nos dois modos):
 * nunca reordenar nem gerar cores novas — acima de 8 fatias vira "Outros".
 */
export const SERIES_COLORS = [
  "#3987e5", // 1 azul
  "#d95926", // 2 laranja
  "#199e70", // 3 verde-água
  "#c98500", // 4 amarelo
  "#d55181", // 5 magenta
  "#008300", // 6 verde
  "#9085e9", // 7 violeta
  "#e66767"  // 8 vermelho
] as const;

/** Cinza neutro para a fatia/grupo "Outros" (não é uma série). */
export const OTHERS_COLOR = "#5b6b86";

export const CHART_COLORS = {
  entradas: SERIES_COLORS[0],
  saidas: SERIES_COLORS[1],
  resultado: SERIES_COLORS[2],
  // Eixos, grade e fundo mudam com o tema claro/escuro (variáveis em global.css)
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  tick: "var(--chart-tick)",
  surface: "var(--chart-surface)",
  cursor: "var(--chart-cursor)"
} as const;
