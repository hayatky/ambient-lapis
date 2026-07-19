"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

import {
  EnvironmentChart,
  type EnvironmentChartSelection,
} from "@/components/dashboard/environment-chart";
import { useKioskData, type KioskInitialData } from "@/hooks/use-kiosk-data";
import { useNow } from "@/hooks/use-now";
import type { CurrentData, StatusData } from "@/lib/api/schemas";
import {
  PERIOD_LABELS,
  resolvePresetPeriod,
  type ResolvedPeriod,
} from "@/lib/period";
import {
  mapAircon,
  mapAirconSegments,
  mapCurrentEnvironment,
  mapEnvironmentSeries,
  mapWarnings,
  type DashboardWarning,
} from "@/lib/view-model";

import { HeaderMenu } from "./header-menu";

type KioskPreset = "24h" | "7d" | "30d";

const selectionTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface KioskProps {
  initial: KioskInitialData;
  serverNowIso: string;
}

export function Kiosk({ initial, serverNowIso }: KioskProps): ReactElement {
  const now = useNow(serverNowIso);
  const [preset, setPreset] = useState<KioskPreset>("24h");
  const [period, setPeriod] = useState<ResolvedPeriod>(() =>
    resolvePresetPeriod("24h", new Date(serverNowIso)),
  );
  const { state, refreshCurrent, loadHistory } = useKioskData(
    initial,
    period,
    setPeriod,
  );
  const [selection, setSelection] = useState<EnvironmentChartSelection | null>(
    null,
  );
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dockVisible, setDockVisible] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockHoveredRef = useRef(false);
  const dockFocusedRef = useRef(false);
  const themeMenuOpenRef = useRef(false);
  const dockHideTimerRef = useRef<number | null>(null);

  const clearDockHideTimer = useCallback((): void => {
    if (dockHideTimerRef.current !== null) {
      window.clearTimeout(dockHideTimerRef.current);
      dockHideTimerRef.current = null;
    }
  }, []);

  const hideDock = useCallback((): void => {
    clearDockHideTimer();
    dockHoveredRef.current = false;
    dockFocusedRef.current = false;
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      dockRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }
    setDockVisible(false);
  }, [clearDockHideTimer]);

  const scheduleDockHide = useCallback((): void => {
    clearDockHideTimer();
    if (dockHoveredRef.current || dockFocusedRef.current) return;
    dockHideTimerRef.current = window.setTimeout(() => {
      dockHideTimerRef.current = null;
      if (!dockHoveredRef.current && !dockFocusedRef.current) {
        setDockVisible(false);
      }
    }, 3000);
  }, [clearDockHideTimer]);

  const revealDock = useCallback((): void => {
    setDockVisible(true);
    scheduleDockHide();
  }, [scheduleDockHide]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (themeMenuOpenRef.current) {
          themeMenuOpenRef.current = false;
          return;
        }
        hideDock();
        return;
      }
      revealDock();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearDockHideTimer();
    };
  }, [clearDockHideTimer, hideDock, revealDock]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      setFullscreenSupported(
        document.fullscreenEnabled &&
          typeof document.documentElement.requestFullscreen === "function" &&
          typeof document.exitFullscreen === "function",
      );
      setFullscreen(document.fullscreenElement !== null);
    }, 0);
    const update = (): void =>
      setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", update);
    return () => {
      window.clearTimeout(initial);
      document.removeEventListener("fullscreenchange", update);
    };
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    try {
      if (
        !document.fullscreenEnabled ||
        typeof document.documentElement.requestFullscreen !== "function" ||
        typeof document.exitFullscreen !== "function"
      ) {
        return;
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen is optional and browser-controlled. Keep the kiosk usable
      // when permission or platform policy rejects the request.
    }
  }, []);

  const environment = state.current
    ? mapCurrentEnvironment(state.current, now)
    : null;
  const aircon = state.current ? mapAircon(state.current, now) : null;
  const environmentSeries = state.environmentSeries
    ? mapEnvironmentSeries(state.environmentSeries, now)
    : null;
  const airconSegments = mapAirconSegments(state.airconSeries, now);
  const warnings = mapAvailableWarnings(state.status, state.current);

  const changePreset = useCallback(
    (next: KioskPreset): void => {
      if (next === preset) return;
      const nextPeriod = resolvePresetPeriod(next, new Date());
      setPreset(next);
      setPeriod(nextPeriod);
      setSelection(null);
      void loadHistory(nextPeriod);
    },
    [preset, loadHistory],
  );

  const retryHistory = useCallback((): void => {
    const nextPeriod = resolvePresetPeriod(preset, new Date());
    setPeriod(nextPeriod);
    void loadHistory(nextPeriod);
  }, [preset, loadHistory]);

  const hasDanger = warnings.some((warning) => warning.severity === "danger");
  useEffect(() => {
    document.title = hasDanger
      ? "⚠ Ambient Lapis — Kiosk"
      : "Ambient Lapis — Kiosk";
  }, [hasDanger]);

  const displayedPeriod = state.historyPeriod ?? period;
  const range = {
    fromMs: Date.parse(displayedPeriod.series.fromIso),
    toMs: Date.parse(displayedPeriod.series.toIso),
  };
  const hasChartPoints =
    environmentSeries !== null && environmentSeries.points.length > 0;

  return (
    <main
      data-testid="kiosk-root"
      className={`kiosk fixed inset-0 isolate h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--ink)] ${
        hasDanger ? "kiosk-danger" : ""
      }`}
      onPointerMove={revealDock}
      onTouchStart={revealDock}
    >
      <div className="absolute inset-0 z-0">
        {hasChartPoints && environmentSeries ? (
          <EnvironmentChart
            series={environmentSeries}
            airconSegments={airconSegments}
            range={range}
            variant="kiosk"
            className="h-full min-h-0 w-full"
            ariaLabel={`${periodLabel(displayedPeriod)}の温度、湿度、Nature Remo認識エアコン設定温度`}
            onSelectionChange={setSelection}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="kiosk-surface relative z-10 max-w-xs px-6 py-5 text-center">
              <p className="m-0 text-sm text-[var(--ink-secondary)]">
                表示できる履歴はまだありません
              </p>
            </div>
          </div>
        )}
      </div>

      <header
        data-testid="kiosk-header"
        className="pointer-events-none absolute inset-x-0 top-0 z-30 px-5 pt-[max(18px,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(26px,env(safe-area-inset-top))] lg:px-12"
      >
        <div className="flex min-h-11 items-start justify-between">
          <p
            data-testid="kiosk-brand"
            className={`kiosk-brand m-0 shrink-0 pt-3 text-[0.72rem] font-medium tracking-[0.14em] text-[var(--ink-muted)] ${dockVisible ? "kiosk-brand-menu-visible" : ""}`}
          >
            Ambient Lapis
          </p>
          <HeaderMenu
            menuRef={dockRef}
            visible={dockVisible}
            fullscreenSupported={fullscreenSupported}
            fullscreen={fullscreen}
            preset={preset}
            onPresetChange={changePreset}
            onFullscreen={() => void toggleFullscreen()}
            onMouseEnter={() => {
              dockHoveredRef.current = true;
              clearDockHideTimer();
              setDockVisible(true);
            }}
            onMouseLeave={() => {
              dockHoveredRef.current = false;
              scheduleDockHide();
            }}
            onFocusCapture={() => {
              dockFocusedRef.current = true;
              clearDockHideTimer();
              setDockVisible(true);
            }}
            onBlurCapture={(event) => {
              const relatedTarget = event.relatedTarget;
              if (
                !(relatedTarget instanceof Node) ||
                !event.currentTarget.contains(relatedTarget)
              ) {
                dockFocusedRef.current = false;
                scheduleDockHide();
              }
            }}
            onThemeMenuOpenChange={(open) => {
              themeMenuOpenRef.current = open;
              if (open) {
                dockFocusedRef.current = true;
                clearDockHideTimer();
              } else if (!dockHoveredRef.current) {
                dockFocusedRef.current = false;
                scheduleDockHide();
              }
            }}
          />
        </div>
      </header>

      <section
        aria-label="現在の室内環境"
        className={`pointer-events-none absolute top-[clamp(58px,10vh,104px)] left-5 z-20 sm:left-8 lg:left-12 ${hasDanger ? "opacity-55" : ""}`}
      >
        <p className="m-0 text-[0.68rem] font-medium tracking-[0.1em] text-[var(--ink-muted)]">
          現在
        </p>
        <div className="mt-2 flex items-end gap-5 sm:gap-8">
          <Metric
            value={environment?.temperature.displayValue ?? "--"}
            unit="°C"
            label="温度"
          />
          <Metric
            value={environment?.humidity.displayValue ?? "--"}
            unit="%"
            label="湿度"
            secondary
          />
        </div>
      </section>

      <section
        aria-label="エアコン - Nature Remo認識状態"
        className={`absolute top-[clamp(132px,18vh,176px)] right-5 z-20 min-w-[10.5rem] py-3 text-right sm:top-[clamp(132px,16vh,168px)] sm:right-8 lg:top-[clamp(112px,14vh,156px)] lg:right-12 ${hasDanger ? "opacity-65" : ""}`}
      >
        <p className="m-0 text-[0.65rem] font-medium tracking-[0.12em] text-[var(--ink-muted)]">
          NATURE REMO認識
        </p>
        {aircon ? (
          <>
            <p className="m-0 mt-1 text-lg font-medium text-[var(--ink)]">
              {aircon.recognitionLabel}
              <span className="ml-2 text-sm font-normal text-[var(--ink-secondary)]">
                {aircon.mode.label}
              </span>
            </p>
            <p className="m-0 mt-1 text-[1.8rem] font-light tracking-[-0.025em] tabular-nums">
              {aircon.targetTemperatureLabel}
            </p>
          </>
        ) : (
          <p className="m-0 mt-2 text-sm text-[var(--ink-secondary)]">
            データなし
          </p>
        )}
      </section>

      <div
        data-testid="kiosk-bottom-overlays"
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center px-3 pb-[max(10px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-[max(18px,env(safe-area-inset-bottom))]"
      >
        {state.historyError ? (
          <div
            role="alert"
            className="kiosk-surface flex items-center gap-3 px-3 text-xs text-[var(--warning)]"
          >
            履歴更新失敗
            <button
              type="button"
              className="kiosk-text-button"
              onClick={retryHistory}
            >
              再試行
            </button>
          </div>
        ) : null}
        {selection ? (
          <SelectionPanel
            selection={selection}
            onClose={() => setSelection(null)}
          />
        ) : null}
        {state.currentError ||
        warnings.some((warning) => warning.severity === "danger") ? (
          <PersistentNotice
            warning={warnings.find((warning) => warning.severity === "danger")}
            currentError={state.currentError}
            onRetry={refreshCurrent}
          />
        ) : null}
      </div>

      {state.historyLoading ? (
        <p
          role="status"
          className="absolute right-5 bottom-20 z-20 m-0 text-xs text-[var(--ink-muted)] sm:right-8"
        >
          履歴を更新中
        </p>
      ) : null}
    </main>
  );
}

function Metric({
  value,
  unit,
  label,
  secondary = false,
}: {
  value: string;
  unit: string;
  label: string;
  secondary?: boolean;
}): ReactElement {
  return (
    <div>
      <p className="m-0 text-[0.68rem] tracking-[0.1em] text-[var(--ink-muted)]">
        {label}
      </p>
      <p
        className={`m-0 mt-1 font-light leading-none tracking-[-0.045em] tabular-nums ${secondary ? "text-[clamp(2.2rem,6vw,4.8rem)]" : "text-[clamp(3.4rem,9vw,7.4rem)]"}`}
      >
        {value}
        <span className="ml-1 text-[0.28em] font-normal tracking-normal text-[var(--ink-secondary)]">
          {unit}
        </span>
      </p>
    </div>
  );
}

function PersistentNotice({
  warning,
  currentError,
  onRetry,
}: {
  warning?: DashboardWarning;
  currentError: boolean;
  onRetry: () => Promise<void>;
}): ReactElement {
  return (
    <div
      role="alert"
      className="kiosk-surface flex max-w-[min(880px,calc(100vw-1.5rem))] items-center gap-3 px-3 text-xs text-[var(--warning)]"
    >
      {currentError ? <span>最新情報を取得できません</span> : null}
      {warning ? <span>{warning.title}</span> : null}
      {warning?.detail ? (
        <span className="hidden text-[var(--ink-secondary)] sm:inline">
          {warning.detail}
        </span>
      ) : null}
      {currentError ? (
        <button
          type="button"
          className="kiosk-text-button"
          onClick={() => void onRetry()}
        >
          再試行
        </button>
      ) : null}
    </div>
  );
}

function SelectionPanel({
  selection,
  onClose,
}: {
  selection: EnvironmentChartSelection;
  onClose: () => void;
}): ReactElement {
  const temperature = selection.point?.temperature.value ?? null;
  const humidity = selection.point?.humidity.value ?? null;
  const target = selection.airconSegment?.targetTemperatureC ?? null;
  const difference =
    temperature !== null && target !== null ? temperature - target : null;
  const airconLabel = selection.airconSegment
    ? selection.airconSegment.state === "on"
      ? "運転中"
      : selection.airconSegment.state === "off"
        ? "停止"
        : selection.airconSegment.state === "gap"
          ? "欠損"
          : "不明"
    : "--";
  return (
    <section
      aria-label="選択時刻の詳細"
      className="kiosk-surface flex max-w-full items-center gap-4 px-4 py-2 text-xs sm:gap-7 sm:px-6"
    >
      <p className="m-0 whitespace-nowrap font-medium text-[var(--ink)]">
        {selectionTimeFormatter.format(selection.epochMs)}
      </p>
      <Detail
        label="温度"
        value={temperature === null ? "--" : `${temperature.toFixed(1)} °C`}
      />
      <Detail
        label="湿度"
        value={humidity === null ? "--" : `${humidity.toFixed(0)} %`}
      />
      <Detail
        label="Remo"
        value={selection.point?.remoOnlineState ?? "--"}
        optional
      />
      <Detail label="エアコン認識" value={airconLabel} optional />
      <Detail
        label="設定"
        value={target === null ? "--" : `${target.toFixed(1)} °C`}
        optional
      />
      <Detail
        label="室温差"
        value={
          difference === null
            ? "--"
            : `${difference > 0 ? "+" : ""}${difference.toFixed(1)} °C`
        }
        optional
      />
      <button
        type="button"
        aria-label="詳細を閉じる"
        onClick={onClose}
        className="kiosk-control px-2"
      >
        ×
      </button>
    </section>
  );
}

function Detail({
  label,
  value,
  optional = false,
}: {
  label: string;
  value: string;
  optional?: boolean;
}): ReactElement {
  return (
    <p
      className={`m-0 whitespace-nowrap ${optional ? "hidden min-[680px]:block" : ""}`}
    >
      <span className="text-[var(--ink-muted)]">{label} </span>
      <span className="font-medium text-[var(--ink)]">{value}</span>
    </p>
  );
}

function mapAvailableWarnings(
  status: StatusData | null,
  current: CurrentData | null,
): DashboardWarning[] {
  if (status && current) return mapWarnings(status, current);
  const warnings: DashboardWarning[] = [];
  if (
    status?.collectionState === "stopped" ||
    (current?.freshness.collectionStopped === true &&
      current.freshness.lastFullSuccessAt !== null)
  ) {
    warnings.push({
      code: "collectionStopped",
      severity: "danger",
      title: "データ収集が停止しています",
      detail: "最後に取得した値を表示しています。",
    });
  }
  if (current?.environment?.remoOnline === false) {
    warnings.push({
      code: "remoOffline",
      severity: "danger",
      title: "Nature Remoがオフラインです",
      detail: "表示値は現在値ではない可能性があります。",
    });
  }
  if (current?.aircon?.recognitionState === "unknown") {
    warnings.push({
      code: "airconUnknown",
      severity: "warning",
      title: "エアコンの認識状態が不明です",
      detail: "ONまたはOFFを推測しません。",
    });
  }
  return warnings;
}

function periodLabel(period: ResolvedPeriod): string {
  const durationMs =
    Date.parse(period.series.toIso) - Date.parse(period.series.fromIso);
  const days = Math.round(durationMs / 86_400_000);
  if (days <= 1) return PERIOD_LABELS["24h"];
  if (days <= 7) return PERIOD_LABELS["7d"];
  return PERIOD_LABELS["30d"];
}
