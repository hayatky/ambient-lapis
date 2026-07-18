import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");

export function validateNodeVersion({ actual, engine, versionFile }) {
  if (engine !== versionFile) {
    throw new Error(
      `Node.js version configuration is inconsistent: package.json requires ${engine}, but .node-version contains ${versionFile}.`,
    );
  }

  if (actual !== engine) {
    throw new Error(
      `Ambient Lapis Web requires Node.js ${engine}, but ${actual} is running. Run: fnm use ${engine}`,
    );
  }
}

export function checkNodeVersion(actual = process.versions.node) {
  const packageJson = JSON.parse(
    readFileSync(resolve(webDirectory, "package.json"), "utf8"),
  );
  const engine = packageJson.engines?.node;
  const versionFile = readFileSync(
    resolve(webDirectory, ".node-version"),
    "utf8",
  ).trim();

  if (typeof engine !== "string" || engine.length === 0) {
    throw new Error("package.json#engines.node must contain an exact version.");
  }

  validateNodeVersion({ actual, engine, versionFile });
}

const entryPoint = process.argv[1];

if (
  entryPoint !== undefined &&
  pathToFileURL(resolve(entryPoint)).href === import.meta.url
) {
  try {
    checkNodeVersion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
