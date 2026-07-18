"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EChartsType } from "echarts/core";

import {
  buildHistoryChartOption,
  buildHistoryChartSummary,
  DEFAULT_CHART_PALETTE,
  loadECharts,
  type ChartPalette,
  type HistoryChartOption,
  type MetricSummary,
} from "@/lib/chart";
import type {
  AirconSegmentViewModel,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DESKTOP_POINTER_QUERY = "(min-width: 768px) and (pointer: fine)";

export interface HistoryChartProps {
  series: EnvironmentSeriesViewModel | null;
  airconSegments: AirconSegmentViewModel[];
  controls?: ReactNode;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function HistoryChart({
  series,
  airconSegments,
  controls,
  isLoading = false,
  isRefreshing = false,
  error = null,
  onRetry,
}: HistoryChartProps) {
  const hasData = Boolean(series && series.points.length > 0);
  const state = error
    ? "error"
    : isLoading && !hasData
      ? "loading"
      : isRefreshing
        ? "refreshing"
        : hasData
          ? "ready"
          : "empty";

  return (
    <section
      className="history-chart"
      data-history-chart
      data-state={state}
      aria-labelledby="history-chart-title"
      aria-busy={isLoading || isRefreshing}
    >
      <header className="history-chart__header">
        <div>
          <p className="history-chart__eyebrow">室内環境</p>
          <h2 id="history-chart-title" className="history-chart__title">
            温度と湿度の履歴
          </h2>
        </div>
        {isRefreshing ? (
          <p className="history-chart__refreshing" role="status">
            更新中
          </p>
        ) : null}
        {controls ? (
          <div className="history-chart__controls">{controls}</div>
        ) : null}
      </header>

      <ChartLegend />

      {error ? (
        <div className="history-chart__notice" data-chart-error role="alert">
          <p>{error}</p>
          {onRetry ? (
            <button
              className="history-chart__retry"
              type="button"
              onClick={onRetry}
            >
              履歴を再取得
            </button>
          ) : null}
        </div>
      ) : null}

      {!hasData && isLoading ? (
        <div
          className="history-chart__placeholder"
          data-chart-loading
          role="status"
        >
          履歴を読み込んでいます
        </div>
      ) : null}

      {!hasData && !isLoading && !error ? (
        <div className="history-chart__empty" data-chart-empty role="status">
          <p>この期間の収集データはまだありません。</p>
          <p>値を補わず、データが届くまで空のまま表示します。</p>
        </div>
      ) : null}

      {series && hasData ? (
        <>
          <HistoryEChart series={series} airconSegments={airconSegments} />
          <ChartSummary series={series} />
        </>
      ) : null}
    </section>
  );
}

function HistoryEChart({
  series,
  airconSegments,
}: {
  series: EnvironmentSeriesViewModel;
  airconSegments: AirconSegmentViewModel[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [runtimeFailed, setRuntimeFailed] = useState(false);
  const palette = useChartPalette();
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const showSlider = useMediaQuery(DESKTOP_POINTER_QUERY);
  const option = useMemo(
    () =>
      buildHistoryChartOption({
        series,
        airconSegments,
        palette,
        reducedMotion,
        showSlider,
      }),
    [airconSegments, palette, reducedMotion, series, showSlider],
  );
  const optionRef = useRef<HistoryChartOption>(option);

  useEffect(() => {
    optionRef.current = option;
  }, [option]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let chart: EChartsType | null = null;

    const handleWindowResize = () => chart?.resize();
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !element.contains(target)) {
        chart?.dispatchAction({ type: "hideTip" });
      }
    };

    void loadECharts()
      .then((runtime) => {
        if (cancelled) return;

        chart = runtime.init(element);
        chartRef.current = chart;
        chart.setOption(optionRef.current, {
          notMerge: true,
          lazyUpdate: true,
        });

        if (typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(() => chart?.resize());
          resizeObserver.observe(element);
        } else {
          window.addEventListener("resize", handleWindowResize);
        }
        document.addEventListener("pointerdown", handleOutsidePointer);
        setChartReady(true);
      })
      .catch(() => {
        if (!cancelled) setRuntimeFailed(true);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("pointerdown", handleOutsidePointer);
      if (chartRef.current === chart) chartRef.current = null;
      chart?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!chartReady) return;
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [chartReady, option]);

  return (
    <div className="history-chart__visual" data-chart-visual>
      <div
        ref={containerRef}
        className="history-chart__canvas"
        data-chart-canvas
        role="img"
        aria-label="温度は左軸、湿度は右軸の履歴グラフ。欠損区間では線を接続せず、中抜きの点は古い計測値、淡い背景帯はエアコンのNature Remo認識状態が運転中の区間を示します。"
        aria-describedby="history-chart-summary"
        tabIndex={0}
      />
      {runtimeFailed ? (
        <p className="history-chart__runtime-error" role="status">
          グラフ描画を開始できませんでした。下の数値要約は利用できます。
        </p>
      ) : null}
    </div>
  );
}

function ChartLegend() {
  return (
    <ul className="history-chart__legend" aria-label="グラフの凡例">
      <LegendItem swatch="temperature">温度 · 左軸</LegendItem>
      <LegendItem swatch="humidity">湿度 · 右軸</LegendItem>
      <LegendItem swatch="stale">古い計測値 · 中抜き点</LegendItem>
      <LegendItem swatch="aircon-on">
        エアコン認識「運転中」 · 淡色帯
      </LegendItem>
    </ul>
  );
}

function LegendItem({
  swatch,
  children,
}: {
  swatch: "temperature" | "humidity" | "stale" | "aircon-on";
  children: ReactNode;
}) {
  return (
    <li className="history-chart__legend-item">
      <span
        className="history-chart__swatch"
        data-swatch={swatch}
        aria-hidden="true"
      />
      {children}
    </li>
  );
}

function ChartSummary({ series }: { series: EnvironmentSeriesViewModel }) {
  const summary = buildHistoryChartSummary(series);
  return (
    <div
      id="history-chart-summary"
      className="history-chart__summary"
      data-chart-summary
      aria-label="表示期間内の最低、最高、最新値"
      tabIndex={0}
    >
      <MetricSummaryBlock
        label="温度"
        metric="temperature"
        summary={summary.temperature}
        unit="°C"
      />
      <MetricSummaryBlock
        label="湿度"
        metric="humidity"
        summary={summary.humidity}
        unit="%"
      />
    </div>
  );
}

function MetricSummaryBlock({
  label,
  metric,
  summary,
  unit,
}: {
  label: "温度" | "湿度";
  metric: "temperature" | "humidity";
  summary: MetricSummary;
  unit: "°C" | "%";
}) {
  return (
    <dl className="history-chart__metric-summary" data-metric={metric}>
      <div className="history-chart__metric-name">
        <dt>{label}</dt>
      </div>
      <SummaryValue label="最低" value={summary.minimum} unit={unit} />
      <SummaryValue label="最高" value={summary.maximum} unit={unit} />
      <SummaryValue label="最新" value={summary.latest} unit={unit} />
    </dl>
  );
}

function SummaryValue({
  label,
  value,
  unit,
}: {
  label: "最低" | "最高" | "最新";
  value: number | null;
  unit: "°C" | "%";
}) {
  const formatted =
    value === null
      ? "--"
      : unit === "°C"
        ? value.toFixed(1)
        : Number.isInteger(value)
          ? value.toFixed(0)
          : value.toFixed(1);

  return (
    <div className="history-chart__summary-value">
      <dt>{label}</dt>
      <dd>
        {formatted}
        {value === null ? null : <span aria-hidden="true"> {unit}</span>}
        {value === null ? null : <span className="sr-only"> {unit}</span>}
      </dd>
    </div>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(DEFAULT_CHART_PALETTE);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const styles = window.getComputedStyle(root);
      const next = {
        surface: readColor(
          styles,
          "--bg-surface",
          DEFAULT_CHART_PALETTE.surface,
        ),
        text: readColor(styles, "--text-primary", DEFAULT_CHART_PALETTE.text),
        mutedText: readColor(
          styles,
          "--text-secondary",
          DEFAULT_CHART_PALETTE.mutedText,
        ),
        border: readColor(
          styles,
          "--border-subtle",
          DEFAULT_CHART_PALETTE.border,
        ),
        temperature: readColor(
          styles,
          "--temperature",
          DEFAULT_CHART_PALETTE.temperature,
        ),
        humidity: readColor(
          styles,
          "--humidity",
          DEFAULT_CHART_PALETTE.humidity,
        ),
        airconOn: readColor(
          styles,
          "--aircon-on",
          DEFAULT_CHART_PALETTE.airconOn,
        ),
      };
      setPalette((current) => (paletteEquals(current, next) ? current : next));
    };

    update();
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return palette;
}

function readColor(
  styles: CSSStyleDeclaration,
  property: string,
  fallback: string,
): string {
  return styles.getPropertyValue(property).trim() || fallback;
}

function paletteEquals(left: ChartPalette, right: ChartPalette): boolean {
  return (
    left.surface === right.surface &&
    left.text === right.text &&
    left.mutedText === right.mutedText &&
    left.border === right.border &&
    left.temperature === right.temperature &&
    left.humidity === right.humidity &&
    left.airconOn === right.airconOn
  );
}
