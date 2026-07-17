import type { ReactElement } from "react";

import type { AirconViewModel } from "@/lib/view-model";
import { formatAge } from "@/lib/view-model/time";

import { StatusDot, WarningIcon } from "./icons";

const MISSING = "--";

interface AirconCardProps {
  aircon: AirconViewModel | null;
  collectionStopped: boolean;
}

// The air-conditioner state as Nature Remo recognizes it. Never presented
// as the machine's actual state: the fixed heading and the permanent
// disclaimer come from the view model.
export function AirconCard({
  aircon,
  collectionStopped,
}: AirconCardProps): ReactElement {
  return (
    <section
      aria-label="エアコン - Nature Remo認識状態"
      className="surface-card flex h-full flex-col gap-5 p-6"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="m-0 text-base font-semibold text-[var(--text-primary)]">
          エアコン
        </h2>
        <p className="m-0 text-[0.8125rem] text-[var(--text-secondary)]">
          Nature Remo認識状態
        </p>
      </header>
      {aircon ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <RecognitionBadge
              state={aircon.recognitionState}
              label={aircon.recognitionLabel}
            />
            {aircon.recognitionState === "on" ? (
              <p className="m-0 text-[0.9375rem] text-[var(--text-primary)]">
                {aircon.mode.known ? aircon.mode.label : "不明なモード"}
                <span className="mx-2 text-[var(--border-subtle)]">/</span>
                設定 {aircon.targetTemperatureLabel}
              </p>
            ) : null}
          </div>
          {!aircon.mode.known && aircon.mode.raw !== "" ? (
            <p className="m-0 -mt-2 text-[0.8125rem] text-[var(--text-secondary)]">
              未対応のモード値: {aircon.mode.raw}
            </p>
          ) : null}
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3">
            <AirconDetail term="モード" value={modeText(aircon)} />
            <AirconDetail
              term="設定温度"
              value={aircon.targetTemperatureLabel}
            />
            <AirconDetail term="風量" value={aircon.volume ?? MISSING} />
            <AirconDetail
              term="上下風向"
              value={aircon.directionVertical ?? MISSING}
            />
            <AirconDetail
              term="左右風向"
              value={aircon.directionHorizontal ?? MISSING}
            />
            <AirconDetail
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
          <p className="m-0 text-[0.8125rem] text-[var(--text-secondary)]">
            取得時刻 {aircon.fetchedAt.label}
          </p>
        </>
      ) : (
        <p className="m-0 text-[0.9375rem] text-[var(--text-secondary)]">
          エアコンの認識状態はまだ取得できていません。
        </p>
      )}
      <p className="m-0 mt-auto border-t border-[var(--border-subtle)] pt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
        表示はNature
        Remoが認識している状態です。エアコン本体との双方向確認ではありません。
      </p>
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

function AirconDetail({
  term,
  value,
}: {
  term: string;
  value: string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[var(--text-secondary)]">{term}</dt>
      <dd className="m-0 text-[0.9375rem] text-[var(--text-primary)] tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function RecognitionBadge({
  state,
  label,
}: {
  state: "on" | "off" | "unknown";
  label: string;
}): ReactElement {
  const styles =
    state === "on"
      ? "border-[color-mix(in_srgb,var(--aircon-on)_45%,transparent)] bg-[color-mix(in_srgb,var(--aircon-on)_12%,var(--bg-surface))] text-[var(--text-primary)]"
      : state === "unknown"
        ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_9%,var(--bg-surface))] text-[var(--text-primary)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]";
  const dotColor =
    state === "on"
      ? "text-[var(--aircon-on)]"
      : state === "unknown"
        ? "text-[var(--warning)]"
        : "text-[var(--text-secondary)]";
  return (
    <span
      className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-4 text-[0.9375rem] font-medium ${styles}`}
    >
      <StatusDot className={dotColor} />
      {label}
    </span>
  );
}
