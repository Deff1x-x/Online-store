/**
 * Local full stack: ASP.NET Core API + client + staff.
 * Cross-platform (Windows PowerShell / macOS / Linux). Does not start Node.
 *
 * Usage from repo root: node scripts/local/dev.mjs
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

function resolveDotnet() {
  const fromEnv = process.env.DOTNET_ROOT
    ? path.join(process.env.DOTNET_ROOT, isWin ? "dotnet.exe" : "dotnet")
    : null;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return isWin ? "dotnet.exe" : "dotnet";
}

const fileEnv = loadDotEnv(path.join(root, ".env"));
const env = {
  ...process.env,
  ...fileEnv,
  ASPNETCORE_ENVIRONMENT: process.env.ASPNETCORE_ENVIRONMENT || fileEnv.ASPNETCORE_ENVIRONMENT || "Development",
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
  VITE_API_URL: process.env.VITE_API_URL || fileEnv.VITE_API_URL || "http://localhost:5000/api",
  VITE_STORE_ID:
    process.env.VITE_STORE_ID ||
    fileEnv.VITE_STORE_ID ||
    "11111111-1111-1111-1111-111111111111",
};

if (String(env.VITE_API_URL).includes(":3000")) {
  console.warn(
    "[dev] VITE_API_URL points at :3000 (Node). Default local stack uses .NET on :5000. Override intentionally only for legacy/parity.",
  );
}

const children = [];
let shuttingDown = false;

function spawnTracked(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: isWin,
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] ${label} exited (code=${code}, signal=${signal ?? "none"})`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
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

const npmCmd = isWin ? "npm.cmd" : "npm";
const dotnet = resolveDotnet();

console.log("[dev] ASP.NET Core API → http://localhost:5000");
console.log("[dev] Client → http://localhost:5173");
console.log("[dev] Staff → http://localhost:5174");
console.log(`[dev] VITE_API_URL=${env.VITE_API_URL}`);

spawnTracked(
  dotnet,
  ["run", "--project", "backend-dotnet/src/Koz.Api/Koz.Api.csproj", "--no-launch-profile", "--urls", "http://127.0.0.1:5000"],
  "dotnet-api",
);
spawnTracked(npmCmd, ["run", "dev", "--workspace=@koz/client"], "client");
spawnTracked(npmCmd, ["run", "dev", "--workspace=@koz/staff"], "staff");
