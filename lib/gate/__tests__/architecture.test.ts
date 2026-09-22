import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `.genesis/PLAN.md` §4 M4's own falsifiability check, verbatim: "a
 * source-scan test (`architecture.test.ts`, same allowlist-import
 * technique shadow-run's own `lib/simulate/__tests__/architecture.
 * test.ts` uses) that greps this package's return type declarations and
 * fails the build if `"forced"` appears anywhere in `lib/gate/**`'s
 * non-test source — proving the omission is structural, not merely
 * untested." `.genesis/DONE.html`'s own locked spec repeats this
 * verbatim as a binary gate. This file is exactly that.
 *
 * WHY A PLAIN TEXT SCAN, NOT `lib/contracts/__tests__/human-id.test.ts`'s
 * COMPILER-SYMBOL APPROACH — ARGUED, NOT ASSUMED: `human-id.test.ts`'s
 * text-based predecessor was defeated by import ALIASING —
 * `import type { HumanId as HID }` then casting through `HID` — because
 * a TYPE REFERENCE's identifier at a call site can be a completely
 * different string of characters from the declaration it resolves to;
 * only the real checker's own symbol resolution can see through that.
 * The word this file hunts for is not a type reference at all — it is
 * the LITERAL STRING VALUE this project's `Intervention["mode"]` union
 * uses to name its highest-risk halt variant. A string literal has no
 * alias mechanism: there is no way to `import { "x" as "y" }` a value
 * and have `"y"` mean `"x"` to a reader or to `tsc`. Renaming what a
 * piece of source text SPELLS, for a bare string literal, is not
 * possible the way renaming what an identifier RESOLVES TO is — so the
 * specific attack that defeated `human-id.ts`'s first scan (aliasing)
 * has no analogue here. This is why a text scan is the right tool for
 * THIS property, not a weaker stand-in for the compiler-based one.
 *
 * THE HONEST LIMIT THIS FILE DOES NOT PRETEND AWAY: a text scan for a
 * literal substring cannot see a runtime string ASSEMBLED without ever
 * spelling that substring in source — `"for" + "ced"`,
 * `String.fromCharCode(102,111,114,99,101,100)`, a unicode escape
 * (`"forced"`), or a value read from `process.env`/a JSON file at
 * runtime all produce the identical six-character string with zero
 * matching text for this scan to find. This is the SAME SHAPE
 * `human-id.ts`'s own disclosed "routes A/B" limit takes (TypeScript's
 * `any`/generics let a value reach a branded type with no cast naming
 * the brand; here, JavaScript's own string-construction primitives let a
 * value reach this literal with no source text naming it) — disclosed
 * below with a real, passing test locking in that the scan does not
 * catch it, not silently left for a future reader to rediscover. Per
 * this account's own standing ruling on that exact class of gap ("do not
 * extend the scanner again"), this file does not attempt to also parse
 * for string concatenation, `String.fromCharCode`, or template
 * expressions — that would be the identical open-ended, ever-widening
 * chase `.genesis/decisions/0001-contracts.md` Decision 2 (round 3)
 * already refused once for a different property.
 *
 * WHY THAT LIMIT IS ACCEPTABLE HERE, ARGUED RATHER THAN ASSERTED: this
 * scan is DELIBERATELY the second, redundant layer of defense, not the
 * load-bearing one. The load-bearing guarantee is
 * `available-interventions.ts`'s own closed `AvailableInterventionKind`
 * union, which has no member spelling this word at all — proven by the
 * `@ts-expect-error` tests in `__tests__/available-interventions.test.ts`.
 * Even a hypothetical future engineer who assembled the runtime string
 * via concatenation specifically to evade THIS file could not insert it
 * into a `Set<AvailableInterventionKind>` (this function's own return
 * type) without an unsafe cast naming that type explicitly and visibly —
 * the identical "requires a deliberate, visible cast" residual
 * `.genesis/decisions/0001-contracts.md` already accepts, at its true
 * strength, for `HumanId`. This file exists because the plan and
 * `.genesis/DONE.html` both name it as a required, independent gate, and
 * because — unlike `HumanId`'s case — the aliasing attack that made a
 * text scan insufficient there does not apply to a literal string value
 * here. See `.genesis/decisions/0004-gate.md` for this argument made in
 * full, including why it was not assumed without being checked.
 *
 * CASE-INSENSITIVE, DELIBERATELY, BEYOND WHAT THE PLAN'S OWN QUOTED TEXT
 * STRICTLY REQUIRES: matching only the exact lowercase spelling would let
 * a trivial `"Forced"`/`"FORCED"` slip through on a technicality that
 * defends nothing real — the same "closing today's known route while
 * leaving an adjacent one open on a technicality" shape this project
 * elsewhere refuses to accept as a genuine closure.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const GATE_ROOT = join(REPO_ROOT, "lib", "gate");
const FORBIDDEN_SUBSTRING = "forced";

function listNonTestSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__") continue; // this directory's own fixtures/specs are exempt — the invariant is about shipped lib/gate/ source, not the test suite proving it (matches human-id.test.ts's own listNonTestSourceFiles exemption).
      files.push(...listNonTestSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

interface Offender {
  readonly file: string;
  readonly line: number;
  readonly context: string;
}

function scanForForbiddenSubstring(root: string): Offender[] {
  const offenders: Offender[] = [];
  for (const file of listNonTestSourceFiles(root)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((lineText, index) => {
      if (lineText.toLowerCase().includes(FORBIDDEN_SUBSTRING)) {
        offenders.push({ file: relative(REPO_ROOT, file), line: index + 1, context: lineText.trim() });
      }
    });
  }
  return offenders;
}

describe("lib/gate's non-test source has structurally no slot for the human-authorized halt mode — proven by a source scan, not just by the type", () => {
  it("the literal substring 'forced' (case-insensitive) never appears anywhere in lib/gate/**'s non-test source", () => {
    const offenders = scanForForbiddenSubstring(GATE_ROOT);
    if (offenders.length > 0) {
      const report = offenders.map((o) => `${o.file}:${o.line}: ${o.context}`).join("\n");
      throw new Error(
        `Found the substring "forced" in lib/gate/**'s non-test source. This engine has no channel to a ` +
          `human and must not manufacture authorization for the halt mode this word names — its return type ` +
          `has structurally no slot for it (see available-interventions.ts), and this word should not appear ` +
          `in this package's own production source either:\n${report}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the scan actually walks real files under lib/gate/, excluding __tests__", () => {
    const files = listNonTestSourceFiles(GATE_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.some((f) => f.endsWith("available-interventions.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("clock.ts"))).toBe(true);
    expect(files.some((f) => f.includes("__tests__"))).toBe(false);
  });

  describe("EXPLOIT REGRESSION: a landed file spelling the word is caught by file and line, then confirmed clean again after removal", () => {
    it("catches a real, on-disk non-test .ts file under lib/gate/ containing the word, names it, then confirms the suite is clean again once removed", () => {
      const scratchFile = join(GATE_ROOT, `__scratch_architecture_${Math.random().toString(36).slice(2)}__.ts`);
      writeFileSync(
        scratchFile,
        ["// a stand-in offender: this line spells the word this scan exists to catch: forced", "export const x = 1;"].join(
          "\n",
        ) + "\n",
      );
      try {
        const offenders = scanForForbiddenSubstring(GATE_ROOT);
        const offender = offenders.find((o) => o.file === relative(REPO_ROOT, scratchFile));
        expect(offender).toBeDefined();
        expect(offender?.line).toBe(1);
      } finally {
        rmSync(scratchFile, { force: true });
      }
      expect(scanForForbiddenSubstring(GATE_ROOT)).toEqual([]);
    });

    it("also catches the word hidden inside a larger word, matching the plan's own 'appears anywhere' wording, not just as a standalone token", () => {
      const scratchFile = join(GATE_ROOT, `__scratch_architecture_${Math.random().toString(36).slice(2)}__.ts`);
      writeFileSync(scratchFile, "// unforceable is fine, but this word is not: enFORCEd\nexport const x = 1;\n");
      try {
        const offenders = scanForForbiddenSubstring(GATE_ROOT);
        expect(offenders.some((o) => o.file === relative(REPO_ROOT, scratchFile))).toBe(true);
      } finally {
        rmSync(scratchFile, { force: true });
      }
    });
  });

  describe("false-positive discipline: a file that never spells the word passes cleanly", () => {
    it("the real lib/gate/ source passes right now (a true positive on the real codebase, not just synthetic fixtures)", () => {
      expect(scanForForbiddenSubstring(GATE_ROOT)).toEqual([]);
    });

    it("does not flag an unrelated word that merely shares a prefix", () => {
      const scratchFile = join(GATE_ROOT, `__scratch_architecture_${Math.random().toString(36).slice(2)}__.ts`);
      writeFileSync(scratchFile, "// this scan should not misfire on words like 'force', 'forces', or 'forceful'\nexport const x = 1;\n");
      try {
        expect(scanForForbiddenSubstring(GATE_ROOT)).toEqual([]);
      } finally {
        rmSync(scratchFile, { force: true });
      }
    });
  });

  /**
   * DISCLOSED LIMIT — NOT A CHECK TO PASS, A GAP PINNED SO IT IS NEVER
   * SILENTLY REDISCOVERED. See this file's own header for the argument
   * this is an acceptable, disclosed residual precisely because the
   * load-bearing guarantee lives in the TYPE (`AvailableInterventionKind`
   * in `available-interventions.ts`), not in this text scan.
   */
  describe("DISCLOSED LIMIT (not a check): a literal-substring scan cannot see a runtime string assembled without ever spelling it in source", () => {
    it("string concatenation produces the identical runtime value with no matching source text", () => {
      const assembled = "for" + "ced";
      expect(assembled).toBe("forced");
      const scratchFile = join(GATE_ROOT, `__scratch_architecture_${Math.random().toString(36).slice(2)}__.ts`);
      writeFileSync(scratchFile, ['export const assembled = "for" + "ced";'].join("\n") + "\n");
      try {
        // Confirmed NOT caught — the source text never contains the six
        // contiguous characters this scan looks for.
        expect(scanForForbiddenSubstring(GATE_ROOT)).toEqual([]);
      } finally {
        rmSync(scratchFile, { force: true });
      }
    });
  });
});
