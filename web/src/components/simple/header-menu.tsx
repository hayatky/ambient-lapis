"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
  type ReactElement,
} from "react";

import {
  getStoredTheme,
  setThemePreference,
  THEME_CHANGE_EVENT,
  type ThemePreference,
} from "@/lib/theme";
import { PERIOD_LABELS } from "@/lib/period";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "自動" },
];

export function HeaderMenu({
  menuRef,
  visible,
  fullscreenSupported,
  fullscreen,
  preset,
  onPresetChange,
  onFullscreen,
  onMouseEnter,
  onMouseLeave,
  onFocusCapture,
  onBlurCapture,
  onThemeMenuOpenChange,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  visible: boolean;
  fullscreenSupported: boolean;
  fullscreen: boolean;
  preset: "24h" | "7d" | "30d";
  onPresetChange: (preset: "24h" | "7d" | "30d") => void;
  onFullscreen: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocusCapture: () => void;
  onBlurCapture: (event: FocusEvent<HTMLDivElement>) => void;
  onThemeMenuOpenChange: (open: boolean) => void;
}): ReactElement {
  const [themeOpen, setThemeOpen] = useState(false);
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>("system");
  const themeTriggerRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const sync = (): void => {
      setThemePreferenceState(getStoredTheme(window.localStorage));
    };
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!themeOpen) return;
    const selectedIndex = Math.max(
      0,
      THEME_OPTIONS.findIndex((option) => option.value === themePreference),
    );
    themeItemRefs.current[selectedIndex]?.focus();
  }, [themeOpen, themePreference]);

  useEffect(() => {
    if (!themeOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (
        target instanceof Node &&
        !themeMenuRef.current?.contains(target) &&
        !themeTriggerRef.current?.contains(target)
      ) {
        setThemeOpen(false);
        onThemeMenuOpenChange(false);
        themeTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onThemeMenuOpenChange, themeOpen]);

  const closeThemeMenu = (returnFocus = true): void => {
    setThemeOpen(false);
    onThemeMenuOpenChange(false);
    if (returnFocus) themeTriggerRef.current?.focus();
  };

  const toggleThemeMenu = (): void => {
    const next = !themeOpen;
    setThemeOpen(next);
    onThemeMenuOpenChange(next);
  };

  const selectTheme = (preference: ThemePreference): void => {
    setThemePreference(preference);
    closeThemeMenu();
  };

  const moveThemeFocus = (index: number, delta: number): void => {
    const next = (index + delta + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    themeItemRefs.current[next]?.focus();
  };

  return (
    <div
      ref={menuRef}
      data-testid="simple-header-menu"
      data-menu-visible={visible ? "true" : "false"}
      aria-hidden={!visible}
      className={`simple-header-menu ml-auto flex items-center justify-end ${visible ? "simple-header-menu-visible" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      <div className="flex items-center justify-end">
        {(["24h", "7d", "30d"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`simple-header-control ${preset === option ? "simple-header-control-active" : ""}`}
            aria-label={PERIOD_LABELS[option]}
            aria-pressed={preset === option}
            onClick={() => onPresetChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="relative">
        <button
          ref={themeTriggerRef}
          type="button"
          className="simple-header-icon-control"
          aria-label={`テーマ: ${THEME_OPTIONS.find((option) => option.value === themePreference)?.label ?? "自動"}`}
          aria-expanded={themeOpen}
          aria-haspopup="menu"
          data-testid="simple-theme-trigger"
          onClick={toggleThemeMenu}
          onKeyDown={(event) => {
            if (event.key === "Escape" && themeOpen) {
              event.preventDefault();
              event.stopPropagation();
              closeThemeMenu();
            }
          }}
        >
          <ThemeIcon preference={themePreference} />
        </button>
        {themeOpen ? (
          <div
            ref={themeMenuRef}
            role="menu"
            aria-label="テーマ"
            data-testid="simple-theme-menu"
            className="simple-theme-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeThemeMenu();
              }
            }}
          >
            {THEME_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  themeItemRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={themePreference === option.value}
                tabIndex={themePreference === option.value ? 0 : -1}
                onClick={() => selectTheme(option.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault();
                    moveThemeFocus(index, 1);
                  } else if (
                    event.key === "ArrowUp" ||
                    event.key === "ArrowLeft"
                  ) {
                    event.preventDefault();
                    moveThemeFocus(index, -1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    themeItemRefs.current[0]?.focus();
                  } else if (event.key === "End") {
                    event.preventDefault();
                    themeItemRefs.current[THEME_OPTIONS.length - 1]?.focus();
                  } else if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectTheme(option.value);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeThemeMenu();
                  }
                }}
                className="simple-theme-item"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {fullscreenSupported ? (
        <button
          type="button"
          className="simple-header-icon-control"
          aria-label={fullscreen ? "全画面を終了" : "全画面"}
          onClick={onFullscreen}
        >
          <FullscreenIcon active={fullscreen} />
        </button>
      ) : null}
      <Link
        href="/"
        className="simple-header-icon-control no-underline"
        aria-label="通常表示"
      >
        <HomeIcon />
      </Link>
    </div>
  );
}

function ThemeIcon({
  preference,
}: {
  preference: ThemePreference;
}): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="simple-icon">
      {preference === "dark" ? (
        <path d="M20.3 15.3A8.5 8.5 0 0 1 8.7 3.7 8.5 8.5 0 1 0 20.3 15.3Z" />
      ) : preference === "system" ? (
        <>
          <rect x="3" y="4" width="18" height="13" rx="1.5" />
          <path d="M8 21h8M12 17v4" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="simple-icon">
      {active ? (
        <path d="M8 3H3v5M3 3l6 6M16 3h5v5M21 3l-6 6M8 21H3v-5M3 21l6-6M16 21h5v-5M21 21l-6-6" />
      ) : (
        <path d="M3 9V3h6M3 3l6 6M21 9V3h-6M21 3l-6 6M3 15v6h6M3 21l6-6M21 15v6h-6M21 21l-6-6" />
      )}
    </svg>
  );
}

function HomeIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="simple-icon">
      <path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" />
    </svg>
  );
}
