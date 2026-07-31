/**
 * Explicit Node + .NET side-by-side for contract parity / comparison.
 * Node :3000, .NET :5000. Frontends are not started (point VITE_API_URL manually).
 *
 * Usage: npm run dev:parity
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWin = process.platform === "win32";

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadDotEnv(path.join(root, ".env"));
const sharedDb = {
  DATABASE_HOST: process.env.DATABASE_HOST || fileEnv.DATABASE_HOST || "localhost",
  DATABASE_PORT: process.env.DATABASE_PORT || fileEnv.DATABASE_PORT || "5432",
  DATABASE_NAME: process.env.DATABASE_NAME || fileEnv.DATABASE_NAME || "online_store",
  DATABASE_USER: process.env.DATABASE_USER || fileEnv.DATABASE_USER || "postgres",
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD || fileEnv.DATABASE_PASSWORD || "postgres",
  JWT_SECRET:
    process.env.JWT_SECRET ||
    fileEnv.JWT_SECRET ||
    "development-only-jwt-secret-do-not-use-in-production",
  OTP_SECRET:
    process.env.OTP_SECRET ||
    fileEnv.OTP_SECRET ||
    "development-only-otp-hmac-secret-do-not-use-in-production",
};

const children = [];
let shuttingDown = false;

function spawnTracked(command, args, label, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...fileEnv, ...sharedDb, ...extraEnv },
    stdio: "inherit",
    shell: isWin,
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[parity] ${label} exited (code=${code}, signal=${signal ?? "none"})`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(code), 500).unref?.();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[parity] Node API → http://localhost:3000 (legacy)");
console.log("[parity] .NET API → http://localhost:5000 (product)");
console.log("[parity] Frontends not started — set VITE_API_URL per backend under test.");

spawnTracked(isWin ? "node.exe" : "node", ["--watch", "src/server.js"], "node-api", {
  NODE_ENV: "development",
  PORT: "3000",
});
spawnTracked(isWin ? "dotnet.exe" : "dotnet", [
  "run",
  "--project",
  "backend-dotnet/src/Koz.Api/Koz.Api.csproj",
  "--no-launch-profile",
  "--urls",
  "http://127.0.0.1:5000",
], "dotnet-api", {
  ASPNETCORE_ENVIRONMENT: "Development",
});
