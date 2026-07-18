import type { ReactElement } from "react";

import type { AirconViewModel } from "@/lib/view-model";
import { formatAge } from "@/lib/view-model/time";

import { StatusDot, WarningIcon } from "./icons";

const MISSING = "--";

interface AirconPanelProps {
  aircon: AirconViewModel | null;
  collectionStopped: boolean;
}

// The aircon column: no box, just a hairline rule on wide screens
// (applied by the parent) and a compressed five-row definition list.
// Always framed as what Nature Remo recognizes, never the machine's
// actual state.
export function AirconPanel({
  aircon,
  collectionStopped,
}: AirconPanelProps): ReactElement {
  return (
    <section
      aria-label="エアコン - Nature Remo認識状態"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="section-label m-0">エアコン</h2>
        <p className="m-0 text-[0.8125rem] text-[var(--ink-secondary)]">
          Nature Remo認識状態
        </p>
      </header>
      {aircon ? (
        <>
          <p className="m-0 flex items-center gap-2.5 text-[1.375rem] leading-tight font-medium text-[var(--ink)]">
            <StatusDot
              className={`shrink-0 ${
                aircon.recognitionState === "on"
                  ? "text-[var(--humidity)]"
                  : aircon.recognitionState === "unknown"
                    ? "text-[var(--warning)]"
                    : "text-[var(--ink-muted)]"
              }`}
            />
            {aircon.recognitionLabel}
            {aircon.recognitionState === "on" ? (
              <span className="text-[0.9375rem] font-normal text-[var(--ink-secondary)]">
                {aircon.mode.known ? aircon.mode.label : "不明なモード"} ・ 設定{" "}
                {aircon.targetTemperatureLabel}
              </span>
            ) : null}
          </p>
          {!aircon.mode.known && aircon.mode.raw !== "" ? (
            <p className="m-0 -mt-2 text-[0.75rem] text-[var(--ink-muted)]">
              未対応のモード値: {aircon.mode.raw}
            </p>
          ) : null}
          <dl className="m-0 flex flex-col">
            <AirconRow term="モード" value={modeText(aircon)} />
            <AirconRow term="設定温度" value={aircon.targetTemperatureLabel} />
            <AirconRow
              term="風量 ・ 風向"
              value={`${aircon.volume ?? MISSING} ・ 上下 ${
                aircon.directionVertical ?? MISSING
              } ／ 左右 ${aircon.directionHorizontal ?? MISSING}`}
            />
            <AirconRow
              term="状態変更時刻"
              value={aircon.settingsUpdatedAt?.label ?? MISSING}
            />
          </dl>
          {collectionStopped ? (
            <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--warning)]">
              <WarningIcon className="shrink-0" />
              最終取得から時間が経過しています(
              {formatAge(aircon.fetchedAt.ageSeconds)})
            </p>
          ) : null}
          <p className="m-0 text-[0.75rem] leading-relaxed text-[var(--ink-muted)]">
            取得時刻 {aircon.fetchedAt.label}
            <br />
            表示はNature
            Remoが認識している状態です。エアコン本体との双方向確認ではありません。
          </p>
        </>
      ) : (
        <>
          <p className="m-0 text-[0.9375rem] text-[var(--ink-secondary)]">
            エアコンの認識状態はまだ取得できていません。
          </p>
          <p className="m-0 text-[0.75rem] leading-relaxed text-[var(--ink-muted)]">
            表示はNature
            Remoが認識している状態です。エアコン本体との双方向確認ではありません。
          </p>
        </>
      )}
    </section>
  );
}

function modeText(aircon: AirconViewModel): string {
  if (aircon.mode.raw === "" && !aircon.mode.known) {
    return "不明";
  }
  if (!aircon.mode.known) {
    return `不明(${aircon.mode.raw})`;
  }
  return aircon.mode.label;
}

function AirconRow({
  term,
  value,
}: {
  term: string;
  value: string;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--hairline)] py-2 first:border-t">
      <dt className="shrink-0 text-[0.75rem] text-[var(--ink-muted)]">
        {term}
      </dt>
      <dd className="m-0 text-right text-[0.875rem] text-[var(--ink)] tabular-nums">
        {value}
      </dd>
    </div>
  );
}
