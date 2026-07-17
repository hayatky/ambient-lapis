"use client";

import { useId, useState, type ReactElement } from "react";

import {
  maxCustomDate,
  resolveCustomPeriod,
  type ResolvedPeriod,
} from "@/lib/period";

interface CustomRangeFieldsProps {
  now: Date;
  onApply: (period: ResolvedPeriod) => void;
}

// Custom date range with native date inputs. The end date is capped at
// today (JST) both via the max attribute and re-validation on apply.
export function CustomRangeFields({
  now,
  onApply,
}: CustomRangeFieldsProps): ReactElement {
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
    "min-h-[40px] rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-[0.875rem] text-[var(--text-primary)] tabular-nums";

  return (
    <form
      aria-label="任意期間の選択"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor={fromId}
          className="text-xs text-[var(--text-secondary)]"
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
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={toId} className="text-xs text-[var(--text-secondary)]">
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
      </div>
      <button
        type="submit"
        className="min-h-[40px] cursor-pointer rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 text-[0.8125rem] font-medium text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--accent-lapis)]"
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
