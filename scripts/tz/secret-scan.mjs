/**
 * Heuristic secret scan for TZ clean passes. Exit 1 on high-confidence hits in source.
 */
import { execFileSync } from "node:child_process";

const patterns = [
  "AKIA[0-9A-Z]{16}",
  "BEGIN RSA PRIVATE KEY",
  "BEGIN OPENSSH PRIVATE KEY",
  "BEGIN PRIVATE KEY",
];

const pathspecs = [
  ".",
  ":!*.md",
  ":!artifacts",
  ":!docs/tz/evidence",
  ":!**/*.png",
  ":!**/bin/**",
  ":!**/obj/**",
  ":!**/*.dll",
];

let hits = [];
for (const pattern of patterns) {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-I", "-n", "-E", "-e", pattern, "--", ...pathspecs],
      { encoding: "utf8" },
    );
    if (out.trim()) hits.push(out.trim());
  } catch (error) {
    if (error.status !== 1) {
      console.error(String(error.stderr || error.message));
      process.exit(2);
    }
  }
}

if (hits.length) {
  console.log(JSON.stringify({ ok: false, hits }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, hits: 0 }, null, 2));
