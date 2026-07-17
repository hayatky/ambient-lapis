"use client";

import { useEffect, useRef, type ReactElement } from "react";

import { echarts } from "@/lib/chart/echarts";
import { buildChartOption } from "@/lib/chart/option";
import { readChartTokens } from "@/lib/chart/tokens";
import { THEME_CHANGE_EVENT } from "@/lib/theme";
import type {
  AirconSegmentViewModel,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

interface EnvironmentChartProps {
  series: EnvironmentSeriesViewModel;
  airconSegments: AirconSegmentViewModel[];
  ariaLabel: string;
}

// ECharts wrapper. Loaded lazily (next/dynamic, ssr disabled) from the
// history section so the chart runtime never blocks the initial page.
export function EnvironmentChart({
  series,
  airconSegments,
  ariaLabel,
}: EnvironmentChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const inputRef = useRef({ series, airconSegments });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const chart = echarts.init(container);
    chartRef.current = chart;

    const pointerCoarse = window.matchMedia("(pointer: coarse)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const render = (): void => {
      chart.setOption(
        buildChartOption({
          series: inputRef.current.series,
          airconSegments: inputRef.current.airconSegments,
          tokens: readChartTokens(document.documentElement),
          pointerType: pointerCoarse.matches ? "coarse" : "fine",
          reducedMotion: reducedMotion.matches,
        }),
        { notMerge: true },
      );
    };
    render();

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(render);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.addEventListener(THEME_CHANGE_EVENT, render);
    reducedMotion.addEventListener("change", render);
    pointerCoarse.addEventListener("change", render);

    // On touch devices the tooltip is pinned by tap; a tap outside the
    // chart releases it.
    const releaseTooltip = (event: Event): void => {
      if (!container.contains(event.target as Node)) {
        chart.dispatchAction({ type: "hideTip" });
      }
    };
    document.addEventListener("touchstart", releaseTooltip, { passive: true });

    return () => {
      document.removeEventListener("touchstart", releaseTooltip);
      pointerCoarse.removeEventListener("change", render);
      reducedMotion.removeEventListener("change", render);
      window.removeEventListener(THEME_CHANGE_EVENT, render);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Re-render when data changes (the init effect runs once).
  useEffect(() => {
    inputRef.current = { series, airconSegments };
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.setOption(
      buildChartOption({
        series,
        airconSegments,
        tokens: readChartTokens(document.documentElement),
        pointerType: window.matchMedia("(pointer: coarse)").matches
          ? "coarse"
          : "fine",
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
      }),
      { notMerge: true },
    );
  }, [series, airconSegments]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className="h-[320px] w-full sm:h-[360px] lg:h-[400px]"
    />
  );
}

export default EnvironmentChart;
