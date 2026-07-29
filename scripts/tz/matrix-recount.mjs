import { readFileSync, writeFileSync } from "node:fs";

const m = readFileSync("docs/tz/KOZ_TZ_TRACEABILITY_MATRIX.md", "utf8");
const ids = new Set();
const status = {};
for (const line of m.split(/\n/)) {
  const row = line.match(/^\|\s*(INV-\d+|A\d+-\d+|B\d+-\d+|B\d+-[A-Z]+|X-\d+)\s*\|/);
  if (!row) continue;
  const id = row[1];
  if (ids.has(id)) continue;
  ids.add(id);
  const stMatch = line.match(
    /\*\*(IMPLEMENTED|PARTIAL|MISSING|INCORRECT|BLOCKED BY TZ|N\/A \(NOT REQUIRED FOR TZ\))\*\*/,
  );
  const st = stMatch ? stMatch[1] : "UNKNOWN";
  const key = st.startsWith("N/A") ? "N/A" : st;
  status[key] = (status[key] || 0) + 1;
}

const out = { unique: ids.size, status };
writeFileSync("artifacts/tz-matrix-recount.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

const ok =
  out.unique === 60 &&
  (status.IMPLEMENTED || 0) === 57 &&
  (status["N/A"] || 0) === 3 &&
  (status.PARTIAL || 0) === 0 &&
  (status.MISSING || 0) === 0 &&
  (status.INCORRECT || 0) === 0 &&
  (status["BLOCKED BY TZ"] || 0) === 0;

if (!ok) {
  console.error("matrix recount mismatch vs expected 60/57/3/0");
  process.exit(1);
}
