/**
 * Soma meses a uma data "AAAA-MM-DD" e devolve no mesmo formato.
 *
 * Quando o dia não existe no mês de destino, usa o último dia do mês:
 * 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto), e não 03/03.
 * Trabalha só com números, sem fuso horário.
 */
export function addMonthsToDate(
  isoDate: string,
  months: number
): string {
  const [year, month, day] = isoDate
    .split("-")
    .map(Number);

  const totalMonths =
    year * 12 + (month - 1) + months;

  const targetYear =
    Math.floor(totalMonths / 12);

  const targetMonth =
    totalMonths % 12;

  const lastDayOfMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();

  const targetDay =
    Math.min(day, lastDayOfMonth);

  return [
    String(targetYear).padStart(4, "0"),
    String(targetMonth + 1).padStart(2, "0"),
    String(targetDay).padStart(2, "0")
  ].join("-");
}
