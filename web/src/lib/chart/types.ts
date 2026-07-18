export interface ChartPalette {
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  temperature: string;
  humidity: string;
  airconOn: string;
}

export interface MetricSummary {
  minimum: number | null;
  maximum: number | null;
  latest: number | null;
}

export interface HistoryChartSummary {
  temperature: MetricSummary;
  humidity: MetricSummary;
}

export const DEFAULT_CHART_PALETTE: ChartPalette = {
  surface: "#ffffff",
  text: "#17212d",
  mutedText: "#5f6e7d",
  border: "#dde5ec",
  temperature: "#c75b3f",
  humidity: "#3379b8",
  airconOn: "#6379c8",
};
