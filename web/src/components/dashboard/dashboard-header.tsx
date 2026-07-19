import type { ReactElement } from "react";
import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";

const headerDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "long",
  day: "numeric",
  weekday: "short",
});

interface DashboardHeaderProps {
  now: Date;
}

// The folio's masthead: wordmark with a single pyrite fleck, today's
// date (this is today's page of the observation log), theme control.
export function DashboardHeader({ now }: DashboardHeaderProps): ReactElement {
  return (
    <header className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <p className="m-0 text-[1.0625rem] font-semibold tracking-[-0.01em] text-[var(--ink)]">
        Ambient Lapis
        <span
          aria-hidden="true"
          className="mb-[0.45em] ml-1.5 inline-block h-[5px] w-[5px] rounded-full bg-[var(--gold)] align-text-bottom"
        />
      </p>
      <p className="m-0 text-[0.9375rem] text-[var(--ink-secondary)]">
        {headerDateFormatter.format(now)}
      </p>
      <div className="ml-auto">
        <div className="flex items-center gap-3">
          <Link
            href="/simple"
            className="min-h-[44px] content-center text-[0.8125rem] font-medium text-[var(--ink-secondary)] no-underline transition-colors hover:text-[var(--ink)]"
          >
            シンプル表示
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
