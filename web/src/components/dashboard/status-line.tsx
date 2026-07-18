import type { ReactElement } from "react";

import type { DashboardViewModel, DashboardWarning } from "@/lib/view-model";
import { formatAge } from "@/lib/view-model/time";

import { StatusDot, WarningIcon } from "./icons";

const STATE_LABELS: Record<DashboardViewModel["collectionState"], string> = {
  initializing: "初回収集待ち",
  healthy: "収集正常",
  degraded: "一部取得失敗",
  stopped: "収集停止",
};

interface StatusLineProps {
  collectionState: DashboardViewModel["collectionState"] | null;
  lastFullSuccessAt: DashboardViewModel["lastFullSuccessAt"];
  warnings: DashboardWarning[];
}

// The persistent status slot: it exists in every state, in the same
// place, so the eye always knows where to check. Healthy shows the gold
// "now" dot; trouble changes color, wording and weight without moving
// the layout. Danger additionally draws a 2px rule across the top of
// the page (a tertiary cue) — the primary danger cue is the dimmed hero.
export function StatusLine({
  collectionState,
  lastFullSuccessAt,
  warnings,
}: StatusLineProps): ReactElement {
  const hasDanger = warnings.some((warning) => warning.severity === "danger");
  const dotClass =
    collectionState === "healthy"
      ? "text-[var(--gold)]"
      : collectionState === "degraded"
        ? "text-[var(--warning)]"
        : collectionState === "stopped"
          ? "text-[var(--danger)]"
          : "text-[var(--ink-muted)]";
  const textClass =
    collectionState === "stopped"
      ? "font-medium text-[var(--danger)]"
      : collectionState === "degraded"
        ? "font-medium text-[var(--warning)]"
        : "text-[var(--ink-secondary)]";

  return (
    <div role={hasDanger ? "alert" : "status"} aria-live="polite">
      {hasDanger ? (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 top-0 z-10 h-[2px] bg-[var(--danger)]"
        />
      ) : null}
      <p
        className={`m-0 flex items-center gap-2 text-[0.8125rem] ${textClass}`}
      >
        <StatusDot className={`shrink-0 ${dotClass}`} />
        {collectionState === null
          ? "収集状態を取得できません"
          : STATE_LABELS[collectionState]}
        {lastFullSuccessAt ? (
          <span className="text-[var(--ink-muted)]">
            最終取得 {formatAge(lastFullSuccessAt.ageSeconds)}(
            {lastFullSuccessAt.label.slice(11)})
          </span>
        ) : null}
      </p>
      {warnings.length > 0 ? (
        <ul className="m-0 mt-3 flex list-none flex-col border-t border-[var(--hairline)] p-0">
          {warnings.map((warning) => (
            <li
              key={warning.code}
              data-severity={warning.severity}
              className={`flex items-center gap-2 border-b border-[var(--hairline)] py-2 text-[0.8125rem] font-medium ${
                warning.severity === "danger"
                  ? "text-[var(--danger)]"
                  : "text-[var(--warning)]"
              }`}
            >
              <WarningIcon className="shrink-0" />
              {warning.title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
