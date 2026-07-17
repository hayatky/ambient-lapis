import { errorResponse } from "./error";

export const resolutions = ["auto", "raw", "15m", "1h", "1d"] as const;
export type Resolution = (typeof resolutions)[number];

export interface RangeQuery {
  from: string;
  to: string;
}

export interface EnvironmentSeriesQuery extends RangeQuery {
  resolution: Resolution;
}

export type QueryValidationResult<T> =
  | { ok: true; value: T; search: string }
  | { ok: false; response: Response };

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function validateAllowedQuery(
  searchParams: URLSearchParams,
  allowed: ReadonlySet<string>,
): Response | undefined {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) {
      return errorResponse(400, {
        code: "invalid_parameter",
        message: `${key} is not allowed`,
        field: key,
      });
    }
    if (searchParams.getAll(key).length !== 1) {
      return errorResponse(400, {
        code: "invalid_parameter",
        message: `${key} must be specified once`,
        field: key,
      });
    }
  }
  return undefined;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseRfc3339(value: string): Date | undefined {
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function rangeError(field: "from" | "to", message: string): Response {
  return errorResponse(400, {
    code: "invalid_parameter",
    message,
    field,
  });
}

function validateRange(
  searchParams: URLSearchParams,
): QueryValidationResult<RangeQuery> {
  const from = searchParams.get("from");
  if (!from) {
    return { ok: false, response: rangeError("from", "from is required") };
  }
  const to = searchParams.get("to");
  if (!to) {
    return { ok: false, response: rangeError("to", "to is required") };
  }

  const parsedFrom = parseRfc3339(from);
  if (!parsedFrom) {
    return {
      ok: false,
      response: rangeError("from", "from must be an RFC 3339 timestamp"),
    };
  }
  const parsedTo = parseRfc3339(to);
  if (!parsedTo) {
    return {
      ok: false,
      response: rangeError("to", "to must be an RFC 3339 timestamp"),
    };
  }
  if (parsedFrom.getTime() >= parsedTo.getTime()) {
    return {
      ok: false,
      response: errorResponse(422, {
        code: "invalid_range",
        message: "from must be earlier than to",
        field: "from",
      }),
    };
  }

  const tenYearsLater = new Date(parsedFrom);
  tenYearsLater.setUTCFullYear(tenYearsLater.getUTCFullYear() + 10);
  if (parsedTo.getTime() > tenYearsLater.getTime()) {
    return {
      ok: false,
      response: errorResponse(422, {
        code: "range_too_large",
        message: "range must not exceed 10 years",
        field: "to",
      }),
    };
  }

  return { ok: true, value: { from, to }, search: "" };
}

export function validateNoQuery(
  request: Request,
): QueryValidationResult<undefined> {
  const url = new URL(request.url);
  const invalid = validateAllowedQuery(url.searchParams, new Set());
  if (invalid) return { ok: false, response: invalid };
  return { ok: true, value: undefined, search: "" };
}

export function validateRangeQuery(
  request: Request,
): QueryValidationResult<RangeQuery> {
  const url = new URL(request.url);
  const invalid = validateAllowedQuery(
    url.searchParams,
    new Set(["from", "to"]),
  );
  if (invalid) return { ok: false, response: invalid };

  const result = validateRange(url.searchParams);
  if (!result.ok) return result;

  const upstream = new URLSearchParams({
    from: result.value.from,
    to: result.value.to,
  });
  return { ...result, search: `?${upstream.toString()}` };
}

export function validateEnvironmentSeriesQuery(
  request: Request,
): QueryValidationResult<EnvironmentSeriesQuery> {
  const url = new URL(request.url);
  const invalid = validateAllowedQuery(
    url.searchParams,
    new Set(["from", "to", "resolution"]),
  );
  if (invalid) return { ok: false, response: invalid };

  const range = validateRange(url.searchParams);
  if (!range.ok) return range;

  const resolution = url.searchParams.get("resolution") ?? "auto";
  if (!(resolutions as readonly string[]).includes(resolution)) {
    return {
      ok: false,
      response: errorResponse(400, {
        code: "invalid_parameter",
        message: "resolution must be one of auto, raw, 15m, 1h, or 1d",
        field: "resolution",
      }),
    };
  }

  const value = {
    ...range.value,
    resolution: resolution as Resolution,
  };
  const upstream = new URLSearchParams({
    from: value.from,
    to: value.to,
    resolution: value.resolution,
  });
  return { ok: true, value, search: `?${upstream.toString()}` };
}
