import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * This is the one passing test in a genesis repo that has no engine code
 * yet (M1 has its own PR and its own verifier). It is deliberately NOT a
 * vacuous `expect(true).toBe(true)` — it pins the two build-tooling facts
 * this repo's README and next.config.ts both claim, so a later change that
 * silently breaks either claim fails `npm test` instead of only being
 * caught (or missed) at `npm run build` time:
 *
 *  1. package.json's dev/build scripts actually pass `--webpack`, matching
 *     the documented reason Turbopack cannot be used (it cannot resolve
 *     NodeNext `.js`-suffixed imports lib/ will use from M1 onward).
 *  2. next.config.ts actually declares the `experimental.extensionAlias`
 *     webpack option that makes those `.js`-suffixed imports resolve at
 *     all — the specific mechanism the first fact depends on.
 *
 * Both facts are read from the real files on disk, not restated as
 * hard-coded literals, so an edit to either file that drops the setting is
 * what actually fails this test.
 */
describe("build tooling matches the documented Turbopack workaround", () => {
  const pkg = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf-8"),
  ) as { scripts: Record<string, string> };
  const nextConfigSource = readFileSync(
    path.join(root, "next.config.ts"),
    "utf-8",
  );

  it("runs dev and build against the webpack bundler, not Turbopack", () => {
    expect(pkg.scripts.dev).toContain("--webpack");
    expect(pkg.scripts.build).toContain("--webpack");
  });

  it("declares the extensionAlias webpack option .js imports need", () => {
    expect(nextConfigSource).toMatch(/extensionAlias/);
    expect(nextConfigSource).toMatch(/"\.js":\s*\[\s*"\.ts"/);
  });
});
