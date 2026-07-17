import type { ReactElement } from "react";

import type { DashboardWarning } from "@/lib/view-model";

import { WarningIcon } from "./icons";

// Top-of-page warning band. Shows each active warning as a slim summary
// row (details live in the affected cards). Severity is conveyed with
// icon + text, never color alone.
export function WarningBanner({
  warnings,
}: {
  warnings: DashboardWarning[];
}): ReactElement | null {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      {warnings.map((warning) => (
        <p
          key={warning.code}
          data-severity={warning.severity}
          className={`m-0 flex items-center gap-2.5 rounded-[12px] border py-2.5 pr-4 pl-3.5 text-[0.8125rem] leading-normal ${
            warning.severity === "danger"
              ? "border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,var(--bg-surface))] text-[var(--danger)]"
              : "border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_7%,var(--bg-surface))] text-[var(--warning)]"
          }`}
        >
          <WarningIcon className="shrink-0" />
          <span className="font-medium">{warning.title}</span>
        </p>
      ))}
    </div>
  );
}
