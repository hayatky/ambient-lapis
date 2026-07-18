"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { echarts } from "@/lib/chart/echarts";
import {
  buildChartOption,
  computeKioskPanelLayout,
  selectNearestChartData,
  type ChartVariant,
  type EnvironmentChartSelection,
} from "@/lib/chart/option";
import { readChartTokens } from "@/lib/chart/tokens";
import { THEME_CHANGE_EVENT } from "@/lib/theme";
import type {
  AirconSegmentViewModel,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

export interface ChartRange {
  fromMs: number;
  toMs: number;
}

export type { ChartVariant, EnvironmentChartSelection };

export interface EnvironmentChartProps {
  series: EnvironmentSeriesViewModel;
  airconSegments: AirconSegmentViewModel[];
  range: ChartRange;
  ariaLabel: string;
  variant?: ChartVariant;
  onSelectionChange?: (selection: EnvironmentChartSelection | null) => void;
  className?: string;
}

// ECharts wrapper. Loaded lazily (next/dynamic, ssr disabled) from the
// history block so the chart runtime never blocks the initial page.
export function EnvironmentChart({
  series,
  airconSegments,
  range,
  ariaLabel,
  variant = "dashboard",
  onSelectionChange,
  className,
}: EnvironmentChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const inputRef = useRef({ series, airconSegments, range, variant });
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectedIndexRef = useRef<number | null>(null);
  const selectedEpochRef = useRef<number | null>(null);
  const crosshairRef = useRef<HTMLDivElement | null>(null);
  const updateCrosshairRef = useRef<(epochMs: number) => void>(() => {});

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const chart = echarts.init(container);
    chartRef.current = chart;

    const pointerCoarse = window.matchMedia("(pointer: coarse)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const removeCrosshair = (): void => {
      crosshairRef.current?.remove();
      crosshairRef.current = null;
    };
    const ensureCrosshair = (): HTMLDivElement | null => {
      if (inputRef.current.variant !== "kiosk") {
        removeCrosshair();
        return null;
      }
      if (crosshairRef.current) {
        return crosshairRef.current;
      }
      const line = document.createElement("div");
      line.className = "environment-chart-crosshair";
      line.dataset.chartCrosshair = "true";
      line.setAttribute("aria-hidden", "true");
      Object.assign(line.style, {
        position: "absolute",
        display: "none",
        width: "2px",
        transform: "translateX(-1px)",
        background: "var(--ink-muted)",
        opacity: "0.88",
        pointerEvents: "none",
        zIndex: "20",
      });
      container.append(line);
      crosshairRef.current = line;
      return line;
    };
    const updateCrosshair = (epochMs: number): void => {
      const line = ensureCrosshair();
      if (!line) {
        return;
      }
      const pixel = chart.convertToPixel({ xAxisIndex: 0 }, epochMs);
      if (typeof pixel !== "number" || !Number.isFinite(pixel)) {
        line.style.display = "none";
        return;
      }
      const layout = computeKioskPanelLayout(
        container.clientHeight,
        container.clientWidth,
      );
      const top = layout.temperatureTop + 14;
      const bottom = layout.ribbonTop + layout.ribbonHeight;
      line.style.left = `${pixel}px`;
      line.style.top = `${top}px`;
      line.style.height = `${Math.max(0, bottom - top)}px`;
      line.style.display = "block";
    };
    updateCrosshairRef.current = updateCrosshair;
    ensureCrosshair();

    const render = (): void => {
      chart.setOption(
        buildChartOption({
          series: inputRef.current.series,
          airconSegments: inputRef.current.airconSegments,
          rangeFromMs: inputRef.current.range.fromMs,
          rangeToMs: inputRef.current.range.toMs,
          heightPx: container.clientHeight,
          widthPx: container.clientWidth,
          variant: inputRef.current.variant,
          tokens: readChartTokens(document.documentElement),
          pointerType: pointerCoarse.matches ? "coarse" : "fine",
          reducedMotion: reducedMotion.matches,
        }),
        { notMerge: true },
      );
    };
    render();

    // Panel layout depends on the container size, so a resize re-renders
    // the option, not just the canvas.
    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
      render();
      if (selectedEpochRef.current !== null) {
        updateCrosshair(selectedEpochRef.current);
      }
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

    const emitSelection = (epochMs: number): void => {
      const selection = selectNearestChartData(
        epochMs,
        inputRef.current.series.points,
        inputRef.current.airconSegments,
      );
      selectedIndexRef.current = inputRef.current.series.points.findIndex(
        (point) => point.time.epochMs === selection.epochMs,
      );
      selectedEpochRef.current = selection.epochMs;
      updateCrosshair(selection.epochMs);
      onSelectionChangeRef.current?.(selection);
    };
    const handleAxisPointer = (event: unknown): void => {
      const axesInfo = (event as { axesInfo?: Array<{ value?: unknown }> })
        .axesInfo;
      const value = axesInfo?.find(
        (axis): axis is { value: number } => typeof axis.value === "number",
      )?.value;
      if (value !== undefined) {
        emitSelection(value);
      }
    };
    chart.on("updateAxisPointer", handleAxisPointer);

    const clearSelection = (): void => {
      selectedIndexRef.current = null;
      selectedEpochRef.current = null;
      if (crosshairRef.current) {
        crosshairRef.current.style.display = "none";
      }
      chart.dispatchAction({ type: "hideTip" });
      onSelectionChangeRef.current?.(null);
    };
    const handlePointerLeave = (): void => {
      if (!pointerCoarse.matches) {
        clearSelection();
      }
    };
    chart.getZr().on("globalout", handlePointerLeave);

    // On touch devices the tooltip is pinned by tap; a tap outside the
    // chart releases it.
    const releaseTooltip = (event: PointerEvent): void => {
      if (
        pointerCoarse.matches &&
        event.target instanceof Node &&
        !container.contains(event.target)
      ) {
        clearSelection();
      }
    };
    document.addEventListener("pointerdown", releaseTooltip, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", releaseTooltip);
      chart.getZr().off("globalout", handlePointerLeave);
      chart.off("updateAxisPointer", handleAxisPointer);
      pointerCoarse.removeEventListener("change", render);
      reducedMotion.removeEventListener("change", render);
      window.removeEventListener(THEME_CHANGE_EVENT, render);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      removeCrosshair();
      updateCrosshairRef.current = () => {};
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Re-render when data changes (the init effect runs once).
  useEffect(() => {
    inputRef.current = { series, airconSegments, range, variant };
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) {
      return;
    }
    chart.setOption(
      buildChartOption({
        series,
        airconSegments,
        rangeFromMs: range.fromMs,
        rangeToMs: range.toMs,
        heightPx: container.clientHeight,
        widthPx: container.clientWidth,
        variant,
        tokens: readChartTokens(document.documentElement),
        pointerType: window.matchMedia("(pointer: coarse)").matches
          ? "coarse"
          : "fine",
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
      }),
      { notMerge: true },
    );
    if (variant !== "kiosk") {
      crosshairRef.current?.remove();
      crosshairRef.current = null;
    } else if (selectedEpochRef.current !== null) {
      updateCrosshairRef.current(selectedEpochRef.current);
    }
  }, [series, airconSegments, range, variant]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      selectedIndexRef.current = null;
      selectedEpochRef.current = null;
      if (crosshairRef.current) {
        crosshairRef.current.style.display = "none";
      }
      chartRef.current?.dispatchAction({ type: "hideTip" });
      onSelectionChangeRef.current?.(null);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const points = inputRef.current.series.points;
    if (points.length === 0) {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const current = selectedIndexRef.current;
    const nextIndex =
      current === null
        ? direction < 0
          ? points.length - 1
          : 0
        : Math.max(0, Math.min(points.length - 1, current + direction));
    const point = points[nextIndex];
    if (!point) {
      return;
    }
    selectedIndexRef.current = nextIndex;
    selectedEpochRef.current = point.time.epochMs;
    chartRef.current?.dispatchAction({
      type: "updateAxisPointer",
      xAxisIndex: 0,
      value: point.time.epochMs,
    });
    chartRef.current?.dispatchAction({
      type: "showTip",
      seriesIndex: 0,
      dataIndex: nextIndex,
    });
    onSelectionChangeRef.current?.(
      selectNearestChartData(
        point.time.epochMs,
        points,
        inputRef.current.airconSegments,
      ),
    );
    updateCrosshairRef.current(point.time.epochMs);
  };

  const heightClass =
    variant === "kiosk"
      ? "relative h-full min-h-0 w-full"
      : "h-[420px] w-full min-[900px]:h-[500px]";

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      aria-keyshortcuts="ArrowLeft ArrowRight Escape"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`${heightClass}${className ? ` ${className}` : ""}`}
    />
  );
}

export default EnvironmentChart;
