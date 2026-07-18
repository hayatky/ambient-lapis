import type { ReactElement } from "react";

// Route-level skeleton shown while the server component fetches the
// initial data. Only neutral shapes on the folio surface: no placeholder
// numbers.
export default function Loading(): ReactElement {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto flex min-h-screen w-full max-w-[1160px] flex-col gap-12 px-5 py-10 sm:px-8 lg:px-12 lg:py-14"
    >
      <div className="flex flex-col gap-4">
        <div className="h-5 w-36 rounded-sm bg-[var(--hairline)]" />
        <div className="h-3.5 w-64 rounded-sm bg-[var(--hairline)] opacity-70" />
      </div>
      <div className="flex flex-col gap-6">
        <div className="h-24 w-72 max-w-full rounded-sm bg-[var(--hairline)] opacity-70" />
        <div className="h-3.5 w-52 rounded-sm bg-[var(--hairline)] opacity-50" />
      </div>
      <div className="h-px w-full bg-[var(--hairline)]" />
      <div className="h-72 w-full rounded-sm bg-[var(--hairline)] opacity-40" />
      <div className="h-40 w-full rounded-sm bg-[var(--hairline)] opacity-40" />
      <p className="m-0 text-[0.8125rem] text-[var(--ink-muted)]">
        読み込んでいます…
      </p>
    </main>
  );
}
