/**
 * Cross-platform wrapper for local DB setup (schema + migrations 001–003 + seed).
 * Windows → setup-db.ps1; Unix → setup-db.sh
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWin = process.platform === "win32";
const script = isWin
  ? path.join(root, "scripts", "local", "setup-db.ps1")
  : path.join(root, "scripts", "local", "setup-db.sh");

const child = isWin
  ? spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    })
  : spawn("bash", [script], { cwd: root, stdio: "inherit", env: process.env });

child.on("exit", (code) => process.exit(code ?? 1));
