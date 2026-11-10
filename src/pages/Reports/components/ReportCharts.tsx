import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type {
  TooltipContentProps,
  TooltipValueType
} from "recharts";

type ChartTooltipProps = TooltipContentProps<TooltipValueType, string | number>;

import {
  CHART_COLORS
} from "../../../constants/chartPalette";

import { formatCurrency } from "../../../utils/currency";

import type {
  GroupedBar,
  PieSlice,
  TimeBucket
} from "../../../utils/reportCharts";

const SERIES_LABELS: Record<string, string> = {
  entradas: "Entradas",
  saidas: "Saídas",
  resultadoAcumulado: "Resultado acumulado"
};

function formatAxisCurrency(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";

  if (abs >= 1_000_000) {
    return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }

  if (abs >= 1_000) {
    return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }

  return `${sign}R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function SeriesTooltip({
  active,
  payload,
  label
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="report-chart-tooltip">
      <strong>{label}</strong>

      {payload.map(item => (
        <div
          key={String(item.dataKey)}
          className="report-chart-tooltip-row"
        >
          <span
            className="report-chart-swatch"
            style={{ background: item.color }}
          />
          <span>{SERIES_LABELS[String(item.dataKey)] ?? item.name}</span>
          <b>{formatCurrency(Number(item.value || 0))}</b>
        </div>
      ))}
    </div>
  );
}

function legendFormatter(value: string) {
  return (
    <span className="report-chart-legend-text">
      {SERIES_LABELS[value] ?? value}
    </span>
  );
}

const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fill: CHART_COLORS.tick, fontSize: 11 },
  tickLine: false
} as const;

type SeriesChartProps = {
  data: TimeBucket[];
  showIncome: boolean;
  showExpense: boolean;
};

/** Infográfico de torres: entradas x saídas lado a lado em cada dia/mês. */
export function BarsReport({
  data,
  showIncome,
  showExpense
}: SeriesChartProps) {
  return (
    <div className="report-chart-box">
      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
          barGap={2}
          barCategoryGap="22%"
        >
          <CartesianGrid
            stroke={CHART_COLORS.grid}
            vertical={false}
          />

          <XAxis
            dataKey="label"
            {...axisProps}
            minTickGap={12}
          />

          <YAxis
            {...axisProps}
            axisLine={false}
            width={78}
            tickFormatter={formatAxisCurrency}
          />

          <Tooltip
            content={SeriesTooltip}
            cursor={{ fill: CHART_COLORS.cursor }}
          />

          <Legend
            formatter={legendFormatter}
            iconType="circle"
            iconSize={9}
            verticalAlign="top"
            itemSorter={null}
            height={32}
          />

          {showIncome && (
            <Bar
              dataKey="entradas"
              fill={CHART_COLORS.entradas}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          )}

          {showExpense && (
            <Bar
              dataKey="saidas"
              fill={CHART_COLORS.saidas}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Infográfico de curvas: entradas, saídas e o resultado acumulado no período. */
export function LinesReport({
  data,
  showIncome,
  showExpense
}: SeriesChartProps) {
  return (
    <div className="report-chart-box">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid
            stroke={CHART_COLORS.grid}
            vertical={false}
          />

          <XAxis
            dataKey="label"
            {...axisProps}
            minTickGap={12}
          />

          <YAxis
            {...axisProps}
            axisLine={false}
            width={78}
            tickFormatter={formatAxisCurrency}
          />

          <Tooltip
            content={SeriesTooltip}
            cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
          />

          <Legend
            formatter={legendFormatter}
            iconType="plainline"
            verticalAlign="top"
            itemSorter={null}
            height={32}
          />

          {showIncome && (
            <Line
              type="monotone"
              dataKey="entradas"
              stroke={CHART_COLORS.entradas}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.surface }}
            />
          )}

          {showExpense && (
            <Line
              type="monotone"
              dataKey="saidas"
              stroke={CHART_COLORS.saidas}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.surface }}
            />
          )}

          {showIncome && showExpense && (
            <Line
              type="monotone"
              dataKey="resultadoAcumulado"
              stroke={CHART_COLORS.resultado}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.surface }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type GroupedBarsReportProps = {
  data: GroupedBar[];
  showIncome: boolean;
  showExpense: boolean;
};

function shortName(name: string) {
  return name.length > 26 ? `${name.slice(0, 25)}…` : name;
}

/**
 * Torres por grupo (conta gerencial, fornecedor/cliente, lançamento...),
 * deitadas para os nomes caberem.
 */
export function GroupedBarsReport({
  data,
  showIncome,
  showExpense
}: GroupedBarsReportProps) {
  const series = (showIncome ? 1 : 0) + (showExpense ? 1 : 0);
  const height = Math.max(220, data.length * (series * 16 + 22) + 70);

  return (
    <div className="report-chart-box">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 20, bottom: 4, left: 8 }}
          barGap={2}
          barCategoryGap="24%"
        >
          <CartesianGrid
            stroke={CHART_COLORS.grid}
            horizontal={false}
          />

          <XAxis
            type="number"
            {...axisProps}
            tickFormatter={formatAxisCurrency}
          />

          <YAxis
            type="category"
            dataKey="name"
            {...axisProps}
            axisLine={false}
            width={170}
            tickFormatter={shortName}
            interval={0}
          />

          <Tooltip
            content={SeriesTooltip}
            cursor={{ fill: CHART_COLORS.cursor }}
          />

          <Legend
            formatter={legendFormatter}
            iconType="circle"
            iconSize={9}
            verticalAlign="top"
            itemSorter={null}
            height={32}
          />

          {showIncome && (
            <Bar
              dataKey="entradas"
              fill={CHART_COLORS.entradas}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
            />
          )}

          {showExpense && (
            <Bar
              dataKey="saidas"
              fill={CHART_COLORS.saidas}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieTooltip({
  active,
  payload
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const slice = payload[0].payload as PieSlice;

  return (
    <div className="report-chart-tooltip">
      <strong>{slice.name}</strong>

      <div className="report-chart-tooltip-row">
        <span>{slice.percent.toLocaleString("pt-BR")}%</span>
        <b>{formatCurrency(slice.value)}</b>
      </div>
    </div>
  );
}

type PieReportProps = {
  slices: PieSlice[];
  /** Cor fixa de cada item (não muda quando um filtro tira outros itens) */
  colorFor: (key: string, index: number) => string;
};

/** Infográfico de pizza: quanto cada parte representa do total. */
export function PieReport({
  slices,
  colorFor
}: PieReportProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="report-pie-layout">
      <div className="report-chart-box report-pie-chart">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Tooltip content={PieTooltip} />

            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="92%"
              paddingAngle={slices.length > 1 ? 1 : 0}
              stroke={slices.length > 1 ? CHART_COLORS.surface : "none"}
              strokeWidth={slices.length > 1 ? 2 : 0}
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell
                  key={slice.key}
                  fill={colorFor(slice.key, index)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="report-pie-center">
          <span>Total</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>

      <ul className="report-pie-legend">
        {slices.map((slice, index) => (
          <li key={slice.key}>
            <span
              className="report-chart-swatch"
              style={{ background: colorFor(slice.key, index) }}
            />
            <span className="report-pie-legend-name">{slice.name}</span>
            <span className="report-pie-legend-percent">
              {slice.percent.toLocaleString("pt-BR")}%
            </span>
            <b>{formatCurrency(slice.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
