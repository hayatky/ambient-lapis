import { badGatewayResponse } from "./error";

export type BffCachePolicy = "current" | "history";

interface SchemaLike {
  safeParse(value: unknown): { success: boolean };
}

export interface ProxyOptions {
  path: string;
  search?: string;
  cachePolicy: BffCachePolicy;
  successSchema: SchemaLike;
  failureSchema: SchemaLike;
  timeoutMs?: number;
}

const CACHE_CONTROL: Record<BffCachePolicy, string> = {
  current: "no-store",
  history: "private, max-age=30",
};

function upstreamBaseUrl(): URL | undefined {
  const value = process.env.REMO_API_BASE_URL?.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function upstreamUrl(base: URL, path: string, search: string): URL {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = search;
  url.hash = "";
  return url;
}

export async function proxyToGo(
  request: Request,
  options: ProxyOptions,
): Promise<Response> {
  const base = upstreamBaseUrl();
  if (!base) return badGatewayResponse();

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 8_000);
  const signal = request.signal.aborted
    ? request.signal
    : AbortSignal.any([request.signal, timeoutSignal]);

  try {
    const upstream = await fetch(
      upstreamUrl(base, options.path, options.search ?? ""),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: options.cachePolicy === "current" ? "no-store" : "default",
        redirect: "error",
        signal,
      },
    );

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      return badGatewayResponse();
    }

    const schema = upstream.ok ? options.successSchema : options.failureSchema;
    if (!schema.safeParse(payload).success) {
      return badGatewayResponse();
    }

    return Response.json(payload, {
      status: upstream.status,
      headers: {
        "Cache-Control": upstream.ok
          ? CACHE_CONTROL[options.cachePolicy]
          : "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return badGatewayResponse();
  }
}
