"use client";

import { useEffect, useState } from "react";

const TICK_MS = 30_000;

// Current time for age/staleness display. Starts from the server-provided
// timestamp so SSR HTML and hydration render identically, then switches to
// the real clock after mount and ticks every 30 seconds.
export function useNow(serverNowIso: string): Date {
  const [now, setNow] = useState(() => new Date(serverNowIso));

  useEffect(() => {
    // The initial correction runs in a task, not synchronously in the
    // effect body, to avoid a cascading render during hydration.
    const initial = window.setTimeout(() => {
      setNow(new Date());
    }, 0);
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, TICK_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  return now;
}
