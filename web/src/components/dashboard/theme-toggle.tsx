"use client";

import { useRef, useSyncExternalStore, type ReactElement } from "react";

import {
  getStoredTheme,
  setThemePreference,
  THEME_CHANGE_EVENT,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "自動" },
];

function subscribe(callback: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): ThemePreference {
  return getStoredTheme(window.localStorage);
}

function getServerSnapshot(): ThemePreference | null {
  return null;
}

// Three-state theme switch (light / dark / follow system) rendered as a
// small radiogroup pill. Selecting an option stores the preference and
// dispatches the theme-change event; ThemeProvider applies it to the DOM.
export function ThemeToggle(): ReactElement {
  const preference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const option = OPTIONS[nextIndex];
      if (option) {
        setThemePreference(option.value);
        buttonRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="テーマ"
      className="flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5"
    >
      {OPTIONS.map((option, index) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={
              preference === null ? (index === 0 ? 0 : -1) : selected ? 0 : -1
            }
            disabled={preference === null}
            onClick={() => {
              setThemePreference(option.value);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            className={`min-h-[36px] cursor-pointer rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors duration-150 ease-out disabled:cursor-default ${
              selected
                ? "bg-[var(--bg-surface)] text-[var(--accent-lapis)] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
