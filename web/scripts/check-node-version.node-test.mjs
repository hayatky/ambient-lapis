import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkNodeVersion,
  validateNodeVersion,
} from "./check-node-version.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

test("accepts the configured Node.js version", () => {
  assert.doesNotThrow(() => checkNodeVersion("24.18.0"));
});

test("rejects a different running Node.js version with recovery guidance", () => {
  assert.throws(
    () =>
      validateNodeVersion({
        actual: "26.0.0",
        engine: "24.18.0",
        versionFile: "24.18.0",
      }),
    /requires Node\.js 24\.18\.0, but 26\.0\.0 is running\. Run: fnm use 24\.18\.0/,
  );
});

test("rejects inconsistent version declarations", () => {
  assert.throws(
    () =>
      validateNodeVersion({
        actual: "24.18.0",
        engine: "24.18.0",
        versionFile: "24.17.0",
      }),
    /package\.json requires 24\.18\.0, but \.node-version contains 24\.17\.0/,
  );
});

test("guards every executable project script", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(scriptDirectory, "../package.json"), "utf8"),
  );
  const guardedScripts = [
    "dev",
    "dev:mock",
    "mock-api",
    "build",
    "start",
    "lint",
    "typecheck",
    "format:check",
    "test:node",
    "test",
    "test:e2e",
  ];

  for (const script of guardedScripts) {
    assert.match(
      packageJson.scripts[script],
      /^npm run (?:check:node|test:node) --silent && /,
      `${script} must validate Node.js before doing work`,
    );
  }
});
