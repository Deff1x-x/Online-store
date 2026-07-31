/**
 * Local ASP.NET Core API only (port 5000).
 * Usage: node scripts/local/dev-api.mjs
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
};

const dotnetCmd = isWin ? "dotnet.exe" : "dotnet";
const child = spawn(
  dotnetCmd,
  [
    "run",
    "--project",
    "backend-dotnet/src/Koz.Api/Koz.Api.csproj",
    "--no-launch-profile",
    "--urls",
    "http://127.0.0.1:5000",
  ],
  { cwd: root, env, stdio: "inherit", shell: isWin },
);

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGTERM"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
