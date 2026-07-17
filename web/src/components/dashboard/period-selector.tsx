"use client";

import { useRef, type ReactElement } from "react";

import { PERIOD_LABELS, PERIOD_PRESETS, type PeriodPreset } from "@/lib/period";

interface PeriodSelectorProps {
  value: PeriodPreset;
  onChange: (preset: PeriodPreset) => void;
}

// Period preset switch (24h / 7d / 30d / custom) as a radiogroup with
// roving tabindex; arrow keys move and select, Enter/Space confirm.
export function PeriodSelector({
  value,
  onChange,
}: PeriodSelectorProps): ReactElement {
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
      const preset = PERIOD_PRESETS[index];
      if (preset) {
        onChange(preset);
      }
      return;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const preset = PERIOD_PRESETS[nextIndex];
      if (preset) {
        onChange(preset);
        buttonRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="表示期間"
      className="flex w-fit items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5"
    >
      {PERIOD_PRESETS.map((preset, index) => {
        const selected = value === preset;
        return (
          <button
            key={preset}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(preset);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            className={`min-h-[40px] cursor-pointer rounded-full px-4 text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-150 ease-out ${
              selected
                ? "bg-[var(--bg-surface)] text-[var(--accent-lapis)] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {PERIOD_LABELS[preset]}
          </button>
        );
      })}
    </div>
  );
}
