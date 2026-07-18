import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(
  process.env.AMBIENT_LAPIS_FAKE_API_PORT ?? "3210",
  10,
);
const GENERATED_AT = "2026-07-18T12:35:00.000Z";
const MAX_CONTROL_BODY_BYTES = 4_096;

if (!Number.isInteger(PORT) || PORT < 1_024 || PORT > 65_535) {
  throw new Error(
    "AMBIENT_LAPIS_FAKE_API_PORT must be a valid unprivileged port",
  );
}

const baseMeta = {
  requestId: "e2e-request-0001",
  generatedAt: GENERATED_AT,
  timezone: "Asia/Tokyo",
};

const healthyStatus = {
  collectionState: "healthy",
  lastFullSuccessAt: "2026-07-18T12:33:01.200Z",
  lastEnvironmentSuccessAt: "2026-07-18T12:33:00.000Z",
  lastAirconSuccessAt: "2026-07-18T12:33:01.000Z",
  lastRun: {
    startedAt: "2026-07-18T12:33:00.000Z",
    completedAt: "2026-07-18T12:33:01.200Z",
    overallStatus: "success",
    devicesStatus: "success",
    appliancesStatus: "success",
    errorCodes: [],
  },
  pollIntervalSeconds: 300,
  staleAfterSeconds: 600,
};

const normalEnvironment = {
  fetchedAt: "2026-07-18T12:33:00.000Z",
  remoOnline: true,
  temperature: {
    valueC: 26.4,
    observedAt: "2026-07-18T12:31:42.000Z",
    stale: false,
  },
  humidity: {
    valuePct: 58,
    observedAt: "2026-07-18T12:31:45.000Z",
    stale: false,
  },
};

const normalAircon = {
  fetchedAt: "2026-07-18T12:33:01.000Z",
  recognitionState: "on",
  mode: { raw: "cool", label: "冷房", known: true },
  targetTemperatureC: 26,
  volume: "auto",
  directionVertical: "auto",
  directionHorizontal: null,
  settingsUpdatedAt: "2026-07-18T11:55:00.000Z",
};

const normalCurrent = {
  environment: normalEnvironment,
  aircon: normalAircon,
  freshness: {
    collectionStopped: false,
    lastFullSuccessAt: healthyStatus.lastFullSuccessAt,
  },
};

const apiFailure = {
  error: {
    code: "upstream_unavailable",
    message: "内部APIへ接続できませんでした",
  },
  meta: {
    requestId: "e2e-error-0001",
    generatedAt: GENERATED_AT,
  },
};

const scenarios = {
  normal: {},
  initializing: {
    status: {
      ...healthyStatus,
      collectionState: "initializing",
      lastFullSuccessAt: null,
      lastEnvironmentSuccessAt: null,
      lastAirconSuccessAt: null,
      lastRun: null,
    },
    current: {
      environment: null,
      aircon: null,
      freshness: { collectionStopped: true, lastFullSuccessAt: null },
    },
    emptyHistory: true,
  },
  noData: {
    current: {
      environment: null,
      aircon: null,
      freshness: {
        collectionStopped: false,
        lastFullSuccessAt: healthyStatus.lastFullSuccessAt,
      },
    },
    emptyHistory: true,
  },
  partialEnvironmentOnly: {
    status: degradedStatus("success", "error", ["upstream_error"]),
    current: { ...normalCurrent, aircon: null },
  },
  partialAirconOnly: {
    status: degradedStatus("error", "success", ["timeout"]),
    current: { ...normalCurrent, environment: null },
  },
  collectionStopped: {
    status: { ...healthyStatus, collectionState: "stopped" },
    current: {
      ...normalCurrent,
      freshness: { ...normalCurrent.freshness, collectionStopped: true },
    },
  },
  remoOffline: {
    current: {
      ...normalCurrent,
      environment: { ...normalEnvironment, remoOnline: false },
    },
  },
  remoUnknown: {
    current: {
      ...normalCurrent,
      environment: { ...normalEnvironment, remoOnline: null },
    },
  },
  temperatureStale: {
    current: {
      ...normalCurrent,
      environment: {
        ...normalEnvironment,
        temperature: { ...normalEnvironment.temperature, stale: true },
      },
    },
  },
  humidityStale: {
    current: {
      ...normalCurrent,
      environment: {
        ...normalEnvironment,
        humidity: { ...normalEnvironment.humidity, stale: true },
      },
    },
  },
  nullMeasurements: {
    current: {
      ...normalCurrent,
      environment: {
        ...normalEnvironment,
        remoOnline: null,
        temperature: { valueC: null, observedAt: null, stale: true },
        humidity: { valuePct: null, observedAt: null, stale: true },
      },
    },
  },
  airconUnknown: {
    current: {
      ...normalCurrent,
      aircon: { ...normalAircon, recognitionState: "unknown" },
    },
  },
  unknownAirconSettings: {
    current: {
      ...normalCurrent,
      aircon: {
        ...normalAircon,
        mode: {
          raw: "vendor-eco-plus",
          label: "vendor-eco-plus",
          known: false,
        },
        volume: "vendor-breeze",
        directionVertical: "vendor-swing-wide",
        directionHorizontal: "",
      },
    },
  },
  autoMode: {
    current: {
      ...normalCurrent,
      aircon: {
        ...normalAircon,
        mode: { raw: "auto", label: "自動", known: true },
        targetTemperatureC: 1.5,
      },
    },
  },
  warningPriority: {
    status: {
      ...degradedStatus("success", "error", ["upstream_error"]),
      collectionState: "stopped",
    },
    current: {
      ...normalCurrent,
      environment: {
        ...normalEnvironment,
        remoOnline: false,
        temperature: { ...normalEnvironment.temperature, stale: true },
        humidity: { ...normalEnvironment.humidity, stale: true },
      },
      aircon: { ...normalAircon, recognitionState: "unknown" },
      freshness: { ...normalCurrent.freshness, collectionStopped: true },
    },
  },
  fullError: {
    status: {
      ...degradedStatus("error", "error", ["timeout", "upstream_error"]),
      lastRun: {
        ...degradedStatus("error", "error", ["timeout", "upstream_error"])
          .lastRun,
        overallStatus: "error",
      },
    },
  },
  currentApiError: {
    errorPaths: new Set(["/api/v1/status", "/api/v1/current"]),
  },
  historyApiError: {
    errorPaths: new Set([
      "/api/v1/environment/series",
      "/api/v1/aircon/series",
      "/api/v1/daily-summary",
    ]),
  },
  apiError: { errorPaths: new Set(["*"]) },
};

let activeScenario = "normal";
let requestLog = [];

function degradedStatus(devicesStatus, appliancesStatus, errorCodes) {
  return {
    ...healthyStatus,
    collectionState: "degraded",
    lastRun: {
      startedAt: "2026-07-18T12:33:00.000Z",
      completedAt: "2026-07-18T12:33:01.200Z",
      overallStatus: "partial",
      devicesStatus,
      appliancesStatus,
      errorCodes,
    },
  };
}

function success(data, meta = baseMeta) {
  return { data, meta };
}

function resolutionFor(url) {
  const requested = url.searchParams.get("resolution") ?? "auto";
  if (requested !== "auto") return requested;

  const from = Date.parse(url.searchParams.get("from") ?? "");
  const to = Date.parse(url.searchParams.get("to") ?? "");
  const duration = to - from;
  if (duration <= 48 * 60 * 60 * 1_000) return "raw";
  if (duration <= 14 * 24 * 60 * 60 * 1_000) return "15m";
  if (duration <= 90 * 24 * 60 * 60 * 1_000) return "1h";
  return "1d";
}

function requestedRange(url) {
  const fallbackTo = Date.parse(GENERATED_AT);
  const parsedFrom = Date.parse(url.searchParams.get("from") ?? "");
  const parsedTo = Date.parse(url.searchParams.get("to") ?? "");
  const to = Number.isFinite(parsedTo) ? parsedTo : fallbackTo;
  const from = Number.isFinite(parsedFrom)
    ? parsedFrom
    : to - 24 * 60 * 60 * 1_000;
  return { from, to };
}

function environmentSeries(url, empty) {
  const { from, to } = requestedRange(url);
  const resolution = resolutionFor(url);
  const points = empty ? [] : buildEnvironmentPoints(from, to, resolution);
  return success(
    { resolution, points },
    {
      ...baseMeta,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      limit: 10_000,
      truncated: false,
    },
  );
}

function buildEnvironmentPoints(from, to, resolution) {
  const pointCount = 9;
  const step = Math.max(1, Math.floor((to - from) / (pointCount - 1)));

  return Array.from({ length: pointCount }, (_, index) => {
    const time = Math.min(to, from + step * index);
    const gap = index === 4;
    const stale = index === 6;
    const temperature = 25.3 + index * 0.22;
    const humidity = 61 - index * 0.55;
    const base = {
      time: new Date(time).toISOString(),
      remoOnlineState: index === 5 ? "offline" : "online",
      gap,
      stale,
    };

    if (resolution === "raw") {
      return {
        ...base,
        temperature: {
          value: gap ? null : Number(temperature.toFixed(1)),
          observedAt: gap ? null : new Date(time - 20_000).toISOString(),
        },
        humidity: {
          value: gap ? null : Number(humidity.toFixed(0)),
          observedAt: gap ? null : new Date(time - 18_000).toISOString(),
        },
      };
    }

    return {
      ...base,
      temperature: {
        avg: gap ? null : Number(temperature.toFixed(1)),
        min: gap ? null : Number((temperature - 0.3).toFixed(1)),
        max: gap ? null : Number((temperature + 0.3).toFixed(1)),
        sampleCount: gap ? 0 : 4,
        latestObservedAt: gap ? null : new Date(time - 20_000).toISOString(),
      },
      humidity: {
        avg: gap ? null : Number(humidity.toFixed(1)),
        min: gap ? null : Number((humidity - 1).toFixed(1)),
        max: gap ? null : Number((humidity + 1).toFixed(1)),
        sampleCount: gap ? 0 : 4,
        latestObservedAt: gap ? null : new Date(time - 18_000).toISOString(),
      },
    };
  });
}

function airconSeries(url, empty) {
  const { from, to } = requestedRange(url);
  const span = Math.max(1, to - from);
  const at = (ratio) => new Date(from + Math.floor(span * ratio)).toISOString();
  const segments = empty
    ? []
    : [
        {
          from: at(0),
          to: at(0.46),
          state: "on",
          mode: "cool",
          targetTemperatureC: 26,
        },
        {
          from: at(0.46),
          to: at(0.72),
          state: "off",
          mode: "cool",
          targetTemperatureC: 26,
        },
        {
          from: at(0.72),
          to: at(1),
          state: "gap",
          mode: null,
          targetTemperatureC: null,
        },
      ];

  return success(
    { segments },
    { ...baseMeta, limit: 10_000, truncated: false },
  );
}

function dailySummary(url, empty) {
  const { to } = requestedRange(url);
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const days = empty
    ? []
    : Array.from({ length: 7 }, (_, index) => ({
        date: dateFormatter.format(new Date(to - index * 24 * 60 * 60 * 1_000)),
        temperature: {
          avg: Number((26.3 - index * 0.1).toFixed(1)),
          min: Number((24.8 - index * 0.1).toFixed(1)),
          max: Number((28.1 - index * 0.1).toFixed(1)),
          sampleCount: 144 - index,
        },
        humidity: {
          avg: Number((57.2 + index * 0.2).toFixed(1)),
          min: 51 + index,
          max: 63 + index,
          sampleCount: 144 - index,
        },
        gapMinutes: index === 1 ? 12 : 0,
      }));

  return success({ days }, { ...baseMeta, limit: 10_000, truncated: false });
}

function json(response, status = 200) {
  return {
    status,
    body: JSON.stringify(response),
  };
}

function apiResponse(url) {
  const scenario = scenarios[activeScenario];
  const errors = scenario.errorPaths;
  if (errors?.has("*") || errors?.has(url.pathname)) {
    return json(apiFailure, 503);
  }

  switch (url.pathname) {
    case "/api/v1/status":
      return json(success(scenario.status ?? healthyStatus));
    case "/api/v1/current":
      return json(success(scenario.current ?? normalCurrent));
    case "/api/v1/environment/series":
      return json(environmentSeries(url, scenario.emptyHistory));
    case "/api/v1/aircon/series":
      return json(airconSeries(url, scenario.emptyHistory));
    case "/api/v1/daily-summary":
      return json(dailySummary(url, scenario.emptyHistory));
    default:
      return json(
        {
          error: { code: "not_found", message: "Not found" },
          meta: apiFailure.meta,
        },
        404,
      );
  }
}

function writeJson(response, payload) {
  response.writeHead(payload.status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(payload.body);
}

async function readControlBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_CONTROL_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/__control/health" && request.method === "GET") {
    writeJson(response, json({ status: "ok" }));
    return;
  }

  if (url.pathname === "/__control/scenario" && request.method === "GET") {
    writeJson(
      response,
      json({
        scenario: activeScenario,
        requests: requestLog,
        availableScenarios: Object.keys(scenarios),
      }),
    );
    return;
  }

  if (url.pathname === "/__control/scenario" && request.method === "PUT") {
    try {
      const body = await readControlBody(request);
      const scenario =
        typeof body === "object" && body !== null ? body.scenario : null;
      if (typeof scenario !== "string" || !(scenario in scenarios)) {
        writeJson(
          response,
          json(
            {
              error: "unknown scenario",
              availableScenarios: Object.keys(scenarios),
            },
            400,
          ),
        );
        return;
      }
      activeScenario = scenario;
      requestLog = [];
      writeJson(response, json({ scenario: activeScenario }));
    } catch {
      writeJson(response, json({ error: "invalid control request" }, 400));
    }
    return;
  }

  if (url.pathname.startsWith("/api/v1/")) {
    if (request.method !== "GET") {
      writeJson(response, json({ error: "method not allowed" }, 405));
      return;
    }
    requestLog.push(`${url.pathname}${url.search}`);
    writeJson(response, apiResponse(url));
    return;
  }

  writeJson(response, json({ error: "not found" }, 404));
});

server.listen(PORT, HOST);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
