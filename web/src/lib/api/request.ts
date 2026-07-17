export function rangeSearchParams(query: {
  from: string;
  to: string;
}): URLSearchParams {
  return new URLSearchParams({ from: query.from, to: query.to });
}

export function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
