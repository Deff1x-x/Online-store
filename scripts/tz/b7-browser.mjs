/**
 * TZ B7 browser acceptance — two Playwright contexts (client @5173 + staff @5174)
 * against API http://127.0.0.1:3000/api (must already be running with seed data).
 *
 * Usage:
 *   node scripts/tz/b7-browser.mjs
 *
 * Env:
 *   B7_SKIP_SERVE=1          — do not start Vite dev servers (assume already up)
 *   B7_EVIDENCE_DIR          — screenshot output directory
 *   B7_CLIENT_URL / B7_STAFF_URL
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const API_BASE = process.env.KOZ_E2E_API_URL ?? "http://127.0.0.1:3000/api";
const CLIENT_URL = process.env.B7_CLIENT_URL ?? "http://127.0.0.1:5173";
const STAFF_URL = process.env.B7_STAFF_URL ?? "http://127.0.0.1:5174";
const EVIDENCE_DIR =
  process.env.B7_EVIDENCE_DIR ?? path.join(root, "docs", "tz", "evidence", "b7-browser");
const VITE_ENV = {
  VITE_API_URL: "http://127.0.0.1:3000/api",
  VITE_STORE_ID: "11111111-1111-1111-1111-111111111111",
};

const SEED_INVENTORY = [
  { productId: "33333333-3333-3333-3333-333333333333", quantity: 50 },
  { productId: "55555555-5555-5555-5555-555555555555", quantity: 30 },
];

async function apiRequest(method, path, { token, body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

async function restoreB7SeedInventory() {
  if (process.env.B7_SKIP_INVENTORY_RESET === "1") return;

  const login = await apiRequest("POST", "/auth/staff/login", {
    body: { email: "manager@koz.kz", password: "Manager123" },
  });
  if (login.status !== 200) {
    throw new Error(`manager login for inventory reset failed: ${login.status}`);
  }

  const token = login.json.token;
  for (const item of SEED_INVENTORY) {
    const result = await apiRequest("PUT", `/my-store/inventory/${item.productId}/receive`, {
      token,
      body: { quantity: item.quantity },
    });
    if (result.status !== 200) {
      throw new Error(`inventory receive ${item.productId} failed: ${result.status}`);
    }
  }
}

const childProcesses = [];

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOk(url) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, { timeoutMs = 120_000, label = url } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fetchOk(url)) return;
    await sleep(500);
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms`);
}

function startDev(workspace, name) {
  const child = spawn("npm", ["run", "dev", "-w", workspace], {
    cwd: root,
    env: { ...process.env, ...VITE_ENV },
    stdio: "ignore",
    shell: true,
  });
  childProcesses.push({ child, name });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[b7-browser] ${name} dev server exited with code ${code}`);
    }
  });
  return child;
}

async function ensureFrontends() {
  if (process.env.B7_SKIP_SERVE === "1") {
    await waitForUrl(CLIENT_URL, { label: "client dev" });
    await waitForUrl(STAFF_URL, { label: "staff dev" });
    return;
  }

  const clientUp = await fetchOk(CLIENT_URL);
  const staffUp = await fetchOk(STAFF_URL);

  if (!clientUp) {
    console.log("[b7-browser] starting @koz/client dev on 5173…");
    startDev("@koz/client", "client");
    await waitForUrl(CLIENT_URL, { label: "client dev" });
  }

  if (!staffUp) {
    console.log("[b7-browser] starting @koz/staff dev on 5174…");
    startDev("@koz/staff", "staff");
    await waitForUrl(STAFF_URL, { label: "staff dev" });
  }
}

async function ensureApi() {
  const health = await fetch(`${API_BASE}/health`);
  if (!health.ok) {
    throw new Error(`API health failed: ${health.status} (${API_BASE}/health)`);
  }
}

function runPlaywright() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["playwright", "test", "scripts/tz/e2e/b7.spec.ts", "--config=playwright.config.ts"],
      {
        cwd: root,
        env: {
          ...process.env,
          ...VITE_ENV,
          B7_CLIENT_URL: CLIENT_URL,
          B7_STAFF_URL: STAFF_URL,
          B7_EVIDENCE_DIR: EVIDENCE_DIR,
        },
        stdio: "inherit",
        shell: true,
      },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`playwright exited with code ${code}`));
    });
  });
}

function shutdownChildren() {
  for (const { child, name } of childProcesses) {
    if (!child.killed) {
      console.log(`[b7-browser] stopping ${name}…`);
      child.kill();
    }
  }
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await ensureApi();
  await restoreB7SeedInventory();
  await ensureFrontends();
  try {
    await runPlaywright();
    console.log(`[b7-browser] evidence: ${EVIDENCE_DIR}`);
  } finally {
    if (process.env.B7_KEEP_SERVE !== "1") {
      shutdownChildren();
    }
  }
}

process.on("SIGINT", () => {
  shutdownChildren();
  process.exit(130);
});

main()
  .then(() => {
    // Vite children keep the event loop alive unless we exit explicitly.
    process.exit(0);
  })
  .catch((error) => {
    shutdownChildren();
    console.error(error);
    process.exit(1);
  });
