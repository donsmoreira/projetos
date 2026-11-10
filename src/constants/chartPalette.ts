/**
 * Cores dos gráficos no fundo escuro ARC (#0b1220).
 * Ordem fixa e validada para daltonismo e contraste (dataviz validate_palette, modo escuro):
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
  grid: "#1d2b46",
  axis: "#2c4068",
  tick: "#8b9ab5",
  surface: "#0b1220",
  cursor: "rgba(61, 155, 255, 0.08)"
} as const;
