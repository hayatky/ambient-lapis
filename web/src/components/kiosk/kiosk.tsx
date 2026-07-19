"use client";

import Link from "next/link";
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
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
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
import { formatAge, toDisplayTimestamp } from "@/lib/view-model/time";

const KIOSK_PRESETS = ["24h", "7d", "30d"] as const;
type KioskPreset = (typeof KIOSK_PRESETS)[number];

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
  const collectionState = state.status?.collectionState ?? null;
  const lastFullSuccessAt = state.status?.lastFullSuccessAt
    ? toDisplayTimestamp(state.status.lastFullSuccessAt, now)
    : null;

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

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-5 pt-[max(18px,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(26px,env(safe-area-inset-top))] lg:px-12">
        <p className="m-0 text-[0.72rem] font-medium tracking-[0.14em] text-[var(--ink-muted)]">
          Ambient Lapis
        </p>
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
        className={`absolute top-[clamp(142px,18vh,172px)] right-5 z-20 min-w-[10.5rem] py-3 text-right sm:top-[clamp(58px,10vh,104px)] sm:right-8 lg:right-12 ${hasDanger ? "opacity-65" : ""}`}
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

      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center px-3 pb-[max(10px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-[max(18px,env(safe-area-inset-bottom))]">
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
        <div
          ref={dockRef}
          data-testid="kiosk-control-dock"
          data-menu-visible={dockVisible ? "true" : "false"}
          aria-hidden={!dockVisible}
          className={`kiosk-dock kiosk-surface mt-2 flex w-full max-w-[880px] flex-wrap items-center justify-center gap-x-2 px-2 py-1.5 sm:flex-nowrap sm:justify-start sm:gap-4 sm:px-3 ${dockVisible ? "kiosk-dock-visible" : ""}`}
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
        >
          <StatusSummary
            collectionState={collectionState}
            warnings={warnings.filter(
              (warning) => warning.severity !== "danger",
            )}
            lastFullSuccessAt={lastFullSuccessAt}
            currentError={false}
            onRetry={refreshCurrent}
          />
          <div className="flex items-center sm:ml-auto">
            {KIOSK_PRESETS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={preset === option}
                onClick={() => changePreset(option)}
                className={`kiosk-control ${preset === option ? "kiosk-control-active" : ""}`}
              >
                {PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
          <div className="order-last basis-full border-t border-[var(--hairline)] sm:order-none sm:basis-auto sm:border-t-0 sm:border-l sm:pl-2">
            <ThemeToggle />
          </div>
          {fullscreenSupported ? (
            <button
              type="button"
              className="kiosk-control"
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? "全画面を終了" : "全画面"}
            </button>
          ) : null}
          <Link href="/" className="kiosk-control no-underline">
            通常表示
          </Link>
        </div>
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

function StatusSummary({
  collectionState,
  warnings,
  lastFullSuccessAt,
  currentError,
  onRetry,
}: {
  collectionState: "initializing" | "healthy" | "degraded" | "stopped" | null;
  warnings: DashboardWarning[];
  lastFullSuccessAt: ReturnType<typeof toDisplayTimestamp> | null;
  currentError: boolean;
  onRetry: () => Promise<void>;
}): ReactElement {
  const warning = warnings[0];
  const label =
    warning?.title ??
    (collectionState === "healthy"
      ? "収集正常"
      : collectionState === "initializing"
        ? "初回収集待ち"
        : "収集状態を確認中");
  return (
    <div className="flex basis-full items-center justify-center gap-2 border-b border-[var(--hairline)] sm:basis-auto sm:justify-start sm:border-b-0">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${warning?.severity === "danger" ? "bg-[var(--danger)]" : warning ? "bg-[var(--warning)]" : "bg-[var(--gold)]"}`}
      />
      <p className="m-0 max-w-[13rem] truncate text-xs text-[var(--ink-secondary)]">
        {currentError ? "最新情報を取得できません" : label}
        {lastFullSuccessAt
          ? ` · ${formatAge(lastFullSuccessAt.ageSeconds)}`
          : ""}
      </p>
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
