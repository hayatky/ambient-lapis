import type {
  AirconViewModel,
  CurrentEnvironmentViewModel,
  DailySummaryViewModel,
  DashboardWarning,
  DisplayTimestamp,
} from "@/lib/view-model/types";

import {
  AirconIcon,
  HumidityIcon,
  RefreshIcon,
  TemperatureIcon,
  WarningIcon,
} from "./icons";

export interface RetryState {
  errorMessage: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRetry: () => void;
}

export function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  if (safeSeconds < 60) return "たった今";
  const minutes = Math.floor(safeSeconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function Timestamp({
  value,
  prefix,
}: {
  value: DisplayTimestamp;
  prefix?: string;
}) {
  return (
    <span>
      {prefix}
      <time dateTime={value.iso}>{value.label}</time>
    </span>
  );
}

function RetryMessage({ state }: { state: RetryState }) {
  if (!state.errorMessage) return null;
  return (
    <div className="panel-error" role="status">
      <span>{state.errorMessage}</span>
      <button onClick={state.onRetry} type="button">
        <RefreshIcon />
        再試行
      </button>
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div aria-label={label} className="panel-loading" role="status">
      <span />
      <span />
      <span />
    </div>
  );
}

export function WarningRail({ warnings }: { warnings: DashboardWarning[] }) {
  if (warnings.length === 0) return null;
  const [primary, ...rest] = warnings;
  if (!primary) return null;

  return (
    <section
      aria-label="現在の注意事項"
      className={`warning-rail warning-rail--${primary.severity}`}
      role={primary.severity === "danger" ? "alert" : "status"}
    >
      <div className="warning-rail__icon">
        <WarningIcon />
      </div>
      <div className="warning-rail__body">
        <p className="warning-rail__eyebrow">確認してください</p>
        <h2>{primary.title}</h2>
        <p>{primary.detail}</p>
      </div>
      {rest.length > 0 ? (
        <ul aria-label="その他の注意事項" className="warning-rail__more">
          {rest.map((warning) => (
            <li key={warning.code}>{warning.title}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export interface EnvironmentPanelProps {
  environment: CurrentEnvironmentViewModel | null;
  initializing: boolean;
  state: RetryState;
}

function Metric({
  kind,
  environment,
}: {
  kind: "temperature" | "humidity";
  environment: CurrentEnvironmentViewModel;
}) {
  const metric = environment[kind];
  const isTemperature = kind === "temperature";
  const Icon = isTemperature ? TemperatureIcon : HumidityIcon;
  const label = isTemperature ? "温度" : "湿度";

  return (
    <section className={`current-metric current-metric--${kind}`}>
      <div className="current-metric__label">
        <Icon />
        <h3>{label}</h3>
      </div>
      <p className="current-metric__value" data-testid={`current-${kind}`}>
        <span>{metric.displayValue}</span>
        <small>{metric.unit}</small>
      </p>
      <div className="current-metric__meta">
        {metric.observedAt ? (
          <Timestamp prefix="計測 " value={metric.observedAt} />
        ) : (
          <span>計測時刻 --</span>
        )}
        {metric.stale ? (
          <span className="metric-warning">
            <WarningIcon />
            計測値が更新されていません
            {metric.observedAt
              ? `（${formatElapsed(metric.observedAt.ageSeconds)}）`
              : ""}
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function EnvironmentPanel({
  environment,
  initializing,
  state,
}: EnvironmentPanelProps) {
  return (
    <section
      aria-labelledby="environment-title"
      className="surface environment-panel"
    >
      <header className="section-heading">
        <div>
          <p className="section-kicker">CURRENT</p>
          <h2 id="environment-title">室内の今</h2>
        </div>
        {environment ? (
          <span
            className={`online-state online-state--${
              environment.remoOnline === true
                ? "online"
                : environment.remoOnline === false
                  ? "offline"
                  : "unknown"
            }`}
          >
            <span aria-hidden="true" />
            {environment.remoOnline === true
              ? "Remo オンライン"
              : environment.remoOnline === false
                ? "Remo オフライン"
                : "Remo 状態不明"}
          </span>
        ) : null}
      </header>

      {state.isLoading && !environment ? (
        <PanelLoading label="現在値を読み込んでいます" />
      ) : environment ? (
        <>
          <div
            aria-busy={state.isRefreshing}
            aria-live="polite"
            className="current-metrics"
          >
            <Metric environment={environment} kind="temperature" />
            <Metric environment={environment} kind="humidity" />
          </div>
          <footer className="environment-panel__footer">
            <Timestamp prefix="最終取得 " value={environment.fetchedAt} />
            {environment.remoOnline === false ? (
              <span className="metric-warning">
                表示値は現在値ではない可能性があります
              </span>
            ) : null}
          </footer>
        </>
      ) : (
        <div className="empty-state">
          <p>
            {initializing
              ? "初回の収集を待っています"
              : "収集データはまだありません"}
          </p>
          <span>
            {initializing
              ? "取得できた値から順に、ここへ表示します。"
              : "次の収集が完了すると温度と湿度が表示されます。"}
          </span>
        </div>
      )}
      <RetryMessage state={state} />
    </section>
  );
}

function SettingItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value && value.trim() !== "" ? value : "--"}</dd>
    </div>
  );
}

export interface AirconPanelProps {
  aircon: AirconViewModel | null;
  initializing: boolean;
  state: RetryState;
}

export function AirconPanel({ aircon, initializing, state }: AirconPanelProps) {
  return (
    <section
      aria-labelledby="aircon-title"
      className={`surface aircon-panel${aircon?.recognitionState === "on" ? " aircon-panel--on" : ""}`}
    >
      <header className="section-heading">
        <div>
          <p className="section-kicker">AIR CONDITIONER</p>
          <h2 id="aircon-title">エアコン - Nature Remo認識状態</h2>
        </div>
        <AirconIcon className="section-heading__icon" />
      </header>

      {state.isLoading && !aircon ? (
        <PanelLoading label="エアコン認識状態を読み込んでいます" />
      ) : aircon ? (
        <div aria-busy={state.isRefreshing}>
          <div className="aircon-state-row">
            <span
              className={`aircon-state aircon-state--${aircon.recognitionState}`}
              data-testid="aircon-recognition-state"
            >
              <span aria-hidden="true" />
              {aircon.recognitionLabel}
            </span>
            <span className="aircon-mode">
              {aircon.mode.known
                ? aircon.mode.label
                : `不明（${aircon.mode.raw || "--"}）`}
            </span>
          </div>

          <dl className="aircon-settings">
            <SettingItem
              label="温度の指定"
              value={aircon.targetTemperatureLabel}
            />
            <SettingItem label="風量" value={aircon.volume} />
            <SettingItem label="上下風向" value={aircon.directionVertical} />
            <SettingItem label="左右風向" value={aircon.directionHorizontal} />
          </dl>

          <div className="aircon-timestamps">
            {aircon.settingsUpdatedAt ? (
              <Timestamp
                prefix="認識状態の変更 "
                value={aircon.settingsUpdatedAt}
              />
            ) : (
              <span>認識状態の変更 --</span>
            )}
            <Timestamp prefix="最終取得 " value={aircon.fetchedAt} />
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>
            {initializing
              ? "認識状態を待っています"
              : "エアコンの収集データはまだありません"}
          </p>
          <span>ON/OFFを推測せず、取得できるまで空の状態を保ちます。</span>
        </div>
      )}

      <RetryMessage state={state} />
      <p className="aircon-disclaimer">
        <WarningIcon />
        エアコン本体との双方向確認ではありません
      </p>
    </section>
  );
}

function formatDailyValue(
  value: number | null,
  digits: number,
  unit: "°C" | "%",
): string {
  return value === null ? "--" : `${value.toFixed(digits)} ${unit}`;
}

export interface DailySummaryPanelProps {
  days: DailySummaryViewModel[];
  state: RetryState;
}

export function DailySummaryPanel({ days, state }: DailySummaryPanelProps) {
  return (
    <section aria-labelledby="daily-title" className="surface daily-panel">
      <header className="section-heading section-heading--wide">
        <div>
          <p className="section-kicker">DAILY RANGE</p>
          <h2 id="daily-title">7日間の記録</h2>
          <p>日本時間の一日ごとに、最低・平均・最高を並べています。</p>
        </div>
      </header>

      {state.isLoading && days.length === 0 ? (
        <PanelLoading label="日次サマリーを読み込んでいます" />
      ) : days.length > 0 ? (
        <div className="daily-table-wrap" aria-busy={state.isRefreshing}>
          <table>
            <thead>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">温度 最低</th>
                <th scope="col">平均</th>
                <th scope="col">最高</th>
                <th scope="col">湿度 最低</th>
                <th scope="col">平均</th>
                <th scope="col">最高</th>
                <th scope="col">欠損</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <th data-label="日付" scope="row">
                    {day.dateLabel}
                  </th>
                  <td data-label="温度 最低">
                    {formatDailyValue(
                      day.temperature?.minimum ?? null,
                      1,
                      "°C",
                    )}
                  </td>
                  <td data-label="温度 平均">
                    {formatDailyValue(
                      day.temperature?.average ?? null,
                      1,
                      "°C",
                    )}
                  </td>
                  <td data-label="温度 最高">
                    {formatDailyValue(
                      day.temperature?.maximum ?? null,
                      1,
                      "°C",
                    )}
                  </td>
                  <td data-label="湿度 最低">
                    {formatDailyValue(day.humidity?.minimum ?? null, 0, "%")}
                  </td>
                  <td data-label="湿度 平均">
                    {formatDailyValue(day.humidity?.average ?? null, 0, "%")}
                  </td>
                  <td data-label="湿度 最高">
                    {formatDailyValue(day.humidity?.maximum ?? null, 0, "%")}
                  </td>
                  <td data-label="欠損">
                    {day.gapMinutes > 0 ? (
                      <span className="daily-gap">
                        <WarningIcon />
                        {day.gapMinutes}分
                      </span>
                    ) : (
                      "なし"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>日次サマリーはまだありません</p>
          <span>一日分のサンプルがたまると、ここで比較できます。</span>
        </div>
      )}
      <RetryMessage state={state} />
    </section>
  );
}
