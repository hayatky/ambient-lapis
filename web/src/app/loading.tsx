import type { ReactElement } from "react";

// Route-level skeleton shown while the server component fetches the
// initial data. Only neutral shapes: no placeholder numbers (§11).
export default function Loading(): ReactElement {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-8 lg:py-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-6 w-40 rounded-full bg-[var(--bg-elevated)]" />
          <div className="h-4 w-56 rounded-full bg-[var(--bg-elevated)]" />
        </div>
        <div className="h-10 w-44 rounded-full bg-[var(--bg-elevated)]" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6 py-2">
          <div className="h-28 w-3/4 max-w-sm rounded-[20px] bg-[var(--bg-elevated)]" />
          <div className="h-28 w-3/4 max-w-sm rounded-[20px] bg-[var(--bg-elevated)]" />
        </div>
        <div className="h-72 rounded-[20px] bg-[var(--bg-elevated)]" />
        <div className="h-96 rounded-[20px] bg-[var(--bg-elevated)] md:col-span-2" />
        <div className="h-64 rounded-[20px] bg-[var(--bg-elevated)] md:col-span-2" />
      </div>
      <p className="m-0 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        読み込んでいます…
      </p>
    </main>
  );
}
