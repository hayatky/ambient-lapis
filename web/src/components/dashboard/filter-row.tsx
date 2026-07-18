"use client";

import { useId, useRef, useState, type ReactElement } from "react";

import {
  maxCustomDate,
  PERIOD_LABELS,
  PERIOD_PRESETS,
  resolveCustomPeriod,
  type PeriodPreset,
  type ResolvedPeriod,
} from "@/lib/period";

interface FilterRowProps {
  preset: PeriodPreset;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomApply: (period: ResolvedPeriod) => void;
  now: Date;
}

// The single filter row that scopes both the history chart and the daily
// records below it. Quiet text tabs with an ink underline (radiogroup
// with roving tabindex); the custom date fields unfold in the same row.
export function FilterRow({
  preset,
  onPresetChange,
  onCustomApply,
  now,
}: FilterRowProps): ReactElement {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % PERIOD_PRESETS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + PERIOD_PRESETS.length) % PERIOD_PRESETS.length;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = PERIOD_PRESETS[index];
      if (target) {
        onPresetChange(target);
      }
      return;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const target = PERIOD_PRESETS[nextIndex];
      if (target) {
        onPresetChange(target);
        buttonRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 border-y border-[var(--hairline)] py-1">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <p className="section-label m-0">期間</p>
        <div
          role="radiogroup"
          aria-label="表示期間"
          className="flex items-center gap-5"
        >
          {PERIOD_PRESETS.map((candidate, index) => {
            const selected = preset === candidate;
            return (
              <button
                key={candidate}
                ref={(element) => {
                  buttonRefs.current[index] = element;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  onPresetChange(candidate);
                }}
                onKeyDown={(event) => {
                  onKeyDown(event, index);
                }}
                className={`min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-[0.875rem] whitespace-nowrap transition-colors duration-150 ease-out ${
                  selected
                    ? "font-medium text-[var(--ink)] shadow-[inset_0_-2px_0_0_var(--ink)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {PERIOD_LABELS[candidate]}
              </button>
            );
          })}
        </div>
        {preset === "custom" ? (
          <CustomRangeFields now={now} onApply={onCustomApply} />
        ) : null}
      </div>
    </div>
  );
}

function CustomRangeFields({
  now,
  onApply,
}: {
  now: Date;
  onApply: (period: ResolvedPeriod) => void;
}): ReactElement {
  const fromId = useId();
  const toId = useId();
  const errorId = useId();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const apply = (): void => {
    const result = resolveCustomPeriod(fromDate, toDate, now);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onApply(result.period);
  };

  const maxDate = maxCustomDate(now);
  const inputClass =
    "min-h-[40px] border-0 border-b border-[var(--hairline-strong)] bg-transparent px-1 text-[0.875rem] text-[var(--ink)] tabular-nums";

  return (
    <form
      aria-label="任意期間の選択"
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label
        htmlFor={fromId}
        className="text-[0.75rem] text-[var(--ink-muted)]"
      >
        開始日
      </label>
      <input
        id={fromId}
        type="date"
        value={fromDate}
        max={maxDate}
        required
        onChange={(event) => {
          setFromDate(event.target.value);
        }}
        aria-describedby={error ? errorId : undefined}
        className={inputClass}
      />
      <label htmlFor={toId} className="text-[0.75rem] text-[var(--ink-muted)]">
        終了日
      </label>
      <input
        id={toId}
        type="date"
        value={toDate}
        max={maxDate}
        required
        onChange={(event) => {
          setToDate(event.target.value);
        }}
        aria-describedby={error ? errorId : undefined}
        className={inputClass}
      />
      <button
        type="submit"
        className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 px-1 text-[0.875rem] font-medium text-[var(--ink)] underline decoration-[var(--ink-muted)] underline-offset-4 transition-colors duration-150 ease-out hover:decoration-[var(--ink)]"
      >
        適用
      </button>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="m-0 w-full text-[0.8125rem] font-medium text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
