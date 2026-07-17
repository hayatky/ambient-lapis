// Mock Go API server for local visual verification and Playwright E2E.
// Runs with plain `node` (Node 24 type stripping). It stands in for the
// Go service behind REMO_API_BASE_URL; the browser still talks only to
// the Next.js BFF. Never used in production. All data is fictional.
//
// Usage:
//   node test/mock-api/server.ts            # port 8090, scenario "normal"
//   MOCK_PORT=8091 MOCK_SCENARIO=noData node test/mock-api/server.ts
//
// Scenario switching at runtime:
//   GET  /__scenario            -> { scenario, available }
//   POST /__scenario {"name"}   -> switches the active scenario

import { createServer } from "node:http";

import {
  buildResponse,
  isScenarioName,
  scenarioNames,
  type ScenarioName,
} from "./responses.ts";

const port = Number(process.env.MOCK_PORT ?? "8090");
const initialScenario = process.env.MOCK_SCENARIO ?? "normal";
if (!isScenarioName(initialScenario)) {
  console.error(`unknown MOCK_SCENARIO: ${initialScenario}`);
  process.exit(1);
}

let scenario: ScenarioName = initialScenario;
let requestCounter = 0;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  requestCounter += 1;
  const requestId = `mock-${String(requestCounter).padStart(6, "0")}`;

  const sendJson = (status: number, body: unknown): void => {
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(body));
  };

  if (url.pathname === "/__scenario") {
    if (request.method === "GET") {
      sendJson(200, { scenario, available: scenarioNames });
      return;
    }
    if (request.method === "POST") {
      let raw = "";
      request.on("data", (chunk: Buffer) => {
        raw += chunk.toString("utf-8");
      });
      request.on("end", () => {
        try {
          const parsed: unknown = JSON.parse(raw);
          const name =
            typeof parsed === "object" && parsed !== null && "name" in parsed
              ? String((parsed as { name: unknown }).name)
              : "";
          if (!isScenarioName(name)) {
            sendJson(400, {
              error: "unknown scenario",
              available: scenarioNames,
            });
            return;
          }
          scenario = name;
          console.log(`scenario switched to ${scenario}`);
          sendJson(200, { scenario });
        } catch {
          sendJson(400, { error: "invalid JSON body" });
        }
      });
      return;
    }
    response.writeHead(405, { allow: "GET, POST" });
    response.end();
    return;
  }

  if (request.method !== "GET") {
    sendJson(405, {
      error: { code: "method_not_allowed", message: "only GET is supported" },
      meta: { requestId, generatedAt: new Date().toISOString() },
    });
    return;
  }

  const mockResponse = buildResponse(
    scenario,
    url.pathname,
    url.searchParams,
    Date.now(),
    requestId,
  );
  if (mockResponse === null) {
    sendJson(404, {
      error: { code: "not_found", message: "unknown path" },
      meta: { requestId, generatedAt: new Date().toISOString() },
    });
    return;
  }
  sendJson(mockResponse.status, mockResponse.body);
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `mock Go API listening on http://127.0.0.1:${port} (scenario: ${scenario})`,
  );
});
