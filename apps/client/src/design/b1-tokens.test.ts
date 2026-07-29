import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TZ Б1 mandates exact design tokens (not pixel-perfect Figma parity).
 * Figma link is «у заказчика»; storefront.html is an optional donor.
 * Excluded from app `tsc` (see tsconfig exclude); run via vitest.
 */
describe("TZ Б1 design tokens", () => {
  const css = readFileSync(
    resolve(process.cwd(), "../../packages/ui/src/styles/index.css"),
    "utf8",
  );

  it("matches TZ :root color tokens", () => {
    expect(css).toMatch(/--koz-color-ink:\s*#111610/i);
    expect(css).toMatch(/--koz-color-panel:\s*#e2e2e2/i);
    expect(css).toMatch(/--koz-color-panel-2:\s*#f4f4f2/i);
    expect(css).toMatch(/--koz-color-acid:\s*#9ccd23/i);
    expect(css).toMatch(/--koz-color-acid-dark:\s*#7fab15/i);
    expect(css).toMatch(/--koz-color-muted:\s*#6b7065/i);
    expect(css).toMatch(/--koz-color-line:\s*#cfcfca/i);
    expect(css).toMatch(/--koz-color-warn:\s*#e08a00/i);
    expect(css).toMatch(/--koz-color-red:\s*#c0392b/i);
  });

  it("uses Unbounded + Inter and 8px grid / 12–24px radii / pills", () => {
    expect(css).toContain('"Unbounded"');
    expect(css).toContain('"Inter"');
    expect(css).toMatch(/--koz-space-1:\s*8px/);
    expect(css).toMatch(/--koz-radius-sm:\s*12px/);
    expect(css).toMatch(/--koz-radius-lg:\s*24px/);
    expect(css).toMatch(/--koz-radius-pill:\s*999px/);
  });
});
