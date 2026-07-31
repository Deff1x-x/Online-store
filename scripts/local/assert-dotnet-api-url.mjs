/**
 * Fail product smoke/E2E when the API base URL targets Node :3000 unless explicitly allowed.
 *
 * Env:
 *   KOZ_E2E_API_URL — API base (…/api)
 *   KOZ_E2E_ALLOW_NODE=1 — permit Node :3000 (parity / legacy only)
 */
export function resolveProductApiBase(defaultUrl = "http://127.0.0.1:5000/api") {
  const base = (process.env.KOZ_E2E_API_URL ?? defaultUrl).replace(/\/$/, "");
  assertDotnetProductTarget(base);
  return base;
}

export function assertDotnetProductTarget(apiBaseUrl) {
  let url;
  try {
    url = new URL(apiBaseUrl.includes("://") ? apiBaseUrl : `http://${apiBaseUrl}`);
  } catch {
    throw new Error(`Invalid API base URL: ${apiBaseUrl}`);
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const allowNode = process.env.KOZ_E2E_ALLOW_NODE === "1";

  if (port === "3000" && !allowNode) {
    throw new Error(
      `Product acceptance must target the .NET API (expected port 5000), got ${apiBaseUrl}. ` +
        `Set KOZ_E2E_ALLOW_NODE=1 only for explicit Node parity/legacy runs.`,
    );
  }

  return { url, port };
}
