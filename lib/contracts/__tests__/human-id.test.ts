import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `human-id.ts` documents that `HumanId` — unlike every other id brand in
 * `ids.ts` — is minted NOWHERE in `lib/`: no `humanId(raw: string):
 * HumanId` convenience constructor exists, specifically so no engine
 * milestone (M3/M4/M5) can satisfy `Intervention`'s `halt`/`forced`
 * `authorizedBy: HumanId` field by fabricating one from an arbitrary
 * string. This test is the structural half of that claim: it greps every
 * non-test `.ts` file under `lib/` for `as HumanId` and fails the build if
 * the cast appears anywhere. Same allowlist-import/grep technique
 * decision-engine's own `brand-casts.test.ts` and shadow-run's
 * `architecture.test.ts` both use — a denylist test is exactly the kind
 * of check that survives reformatting/renaming attacks a linter rule
 * would not (and no ESLint is installed in this project, matching
 * decision-engine's own stated reason for reaching for a source-scan test
 * instead).
 *
 * UNLIKE decision-engine's `brand-casts.test.ts`, there is no excluded
 * "defining file" here — `Confidence`/`CostOfBeingWrong` each have exactly
 * one file that legitimately performs their one necessary cast, inside a
 * real parser. `HumanId` has no parser and no legitimate cast anywhere in
 * `lib/`, by design: every `as HumanId` this scan finds outside a test
 * file is a violation, full stop.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");

const CAST_PATTERN = /\bas\s+HumanId\b/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

function scanForHumanIdCasts(): string[] {
  const offenders: string[] = [];
  for (const file of listSourceFiles(LIB_ROOT)) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      if (CAST_PATTERN.test(line)) {
        offenders.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  return offenders;
}

describe("HumanId is never fabricated via cast anywhere in lib/ non-test source", () => {
  it("no `as HumanId` appears outside a *.test.ts file", () => {
    const offenders = scanForHumanIdCasts();
    if (offenders.length > 0) {
      throw new Error(
        "Found a HumanId cast outside a test file. HumanId has no minting function anywhere in " +
          "lib/ (see human-id.ts) precisely so no engine milestone can fabricate a human " +
          "authorization — construct a HaltForced value only with a HumanId that actually came " +
          "from a real human-facing boundary:\n" +
          offenders.join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the scan actually walks real source files, so a passing result isn't vacuous", () => {
    const sourceFiles = listSourceFiles(LIB_ROOT);
    expect(sourceFiles.length).toBeGreaterThanOrEqual(10);
    expect(sourceFiles.some((f) => f.endsWith("intervention.ts"))).toBe(true);
    expect(sourceFiles.some((f) => f.endsWith("human-id.ts"))).toBe(true);
  });

  it("FALSIFIABILITY: the pattern itself does match a HumanId cast when one is present", () => {
    // Proves the regex isn't accidentally inert (e.g. a typo that could never match anything).
    expect(CAST_PATTERN.test('const x = "alice" as HumanId;')).toBe(true);
    expect(CAST_PATTERN.test('const x = "alice" as AgentId;')).toBe(false);
  });
});
