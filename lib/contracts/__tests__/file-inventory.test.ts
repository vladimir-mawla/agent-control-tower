import { describe, expect, it } from "vitest";
import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

/**
 * L4 VERIFY (round 4) reported a working route to `HumanId` with NO
 * expression for `human-id.test.ts`'s checker-based scan to inspect at
 * all:
 *
 *     // lib/contracts/fake-human.d.ts
 *     import type { HumanId } from "./human-id.js";
 *     export declare const fakeHuman: HumanId;
 *
 *     // lib/contracts/fake-human.js
 *     export const fakeHuman = "shipped-via-dts-js-pair-not-a-real-human";
 *
 *     // lib/contracts/attackC.ts — no cast, no any, no generic
 *     import { fakeHuman } from "./fake-human.js";
 *     export const attackC: HumanId = fakeHuman;
 *
 * `attackC.ts` typechecks clean and `fakeHuman` is a real runtime string
 * that satisfies `assertValidHaltForced` — the lie lives entirely in an
 * ambient declaration (`fake-human.d.ts`) with no expression to walk, and
 * a `.js` runtime file the AST-walking scan never opens (it only ever
 * calls `analyzeFile`/`analyzeScratch` on `.ts` paths). This is NOT
 * another instance of the disclosed "TypeScript is unsound" class from
 * `human-id.ts`'s header (routes A/B): those are the type CHECKER
 * accepting something unsafe inside checked `.ts` source; this is the
 * SCANNER's own FILE COVERAGE — it only ever reads `.ts` files, and
 * nothing had ever stated that as the scan's input domain, or made the
 * domain match `lib/`'s actual, permitted contents.
 *
 * THE FIX IS NOT TO ALSO PARSE `.d.ts`/`.js` FILES — that would be
 * scanner-chasing again, on a new axis, with the same open-ended shape
 * (a `.mjs`, then a `.cjs`, then a build artifact nobody thought to
 * check). Per the coordinator's explicit ruling: close the axis instead
 * of defending it. This project is all-TypeScript; a non-`.ts` file under
 * `lib/` is anomalous on its own terms, independent of this attack. This
 * file makes the scanner's input domain (".ts files under lib/") and
 * `lib/`'s own INTERNAL contents THE SAME SET, by construction: no
 * non-`.ts` file may exist under `lib/`.
 *
 * THIS FILE, ALONE, DOES NOT CLOSE THE WHOLE AXIS — SAID PLAINLY, BECAUSE
 * AN EARLIER VERSION OF THIS HEADER CLAIMED IT DID AND WAS WRONG:
 * independent verification (round 5) moved the identical `.d.ts`/`.js`
 * pair one directory up (`scripts/external-human.d.ts`/`.js`, outside
 * `lib/` entirely) and imported it from a `lib/contracts/*.ts` file via a
 * relative path walking out and back in — this check never sees a file
 * outside `lib/` at all, so it correctly reported nothing. The composed
 * closure needs a SECOND check this file does not provide:
 * `__tests__/import-containment.test.ts`, which confirms no import
 * anywhere in `lib/**` may resolve outside `lib/**`. Only together do the
 * two make "no ambient-declaration lie can exist anywhere `lib/`'s own
 * code can reach" a true statement — see `human-id.ts`'s and
 * `intervention.ts`'s headers, and `.genesis/decisions/
 * 0001-contracts.md` Decision 2, for that composed claim stated in full.
 *
 * `human-id.ts` and `intervention.ts`'s own headers each state the
 * COMPOSED domain in one place, naming both this file and
 * `import-containment.test.ts` as the checks that keep it honest — see
 * those files rather than re-deriving the argument here.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");

function listAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

/**
 * The canonical-form check: a file's basename must end in `.ts` and must
 * NOT end in `.d.ts`. Deliberately not based on `path.extname` — Node's
 * `extname("fake-human.d.ts")` returns `".ts"`, not `".d.ts"` (it only
 * ever looks at the LAST dot-separated segment), which would make an
 * extname-based check blind to the exact ambient-declaration shape this
 * file exists to reject. `endsWith` checked directly against the whole
 * basename has no such blind spot.
 */
function isAllowedLibFile(filePath: string): boolean {
  const base = basename(filePath);
  if (base.endsWith(".d.ts")) return false;
  return base.endsWith(".ts");
}

function findOffenders(): string[] {
  return listAllFiles(LIB_ROOT)
    .filter((f) => !isAllowedLibFile(f))
    .map((f) => relative(REPO_ROOT, f))
    .sort();
}

describe("every file under lib/** is a .ts file — closes the scanner's input domain by construction, not by parsing more file types", () => {
  it("no .js/.d.ts/.mjs/.cjs/.jsx/or-anything-else file exists anywhere under lib/, source or test", () => {
    const offenders = findOffenders();
    if (offenders.length > 0) {
      throw new Error(
        `lib/** may contain only .ts files (never .d.ts, .js, .mjs, .cjs, .jsx, or any other extension) — an ` +
          `ambient declaration (.d.ts) paired with a runtime .js file can assert a branded type onto a value ` +
          `with no expression for any AST-walking scan to inspect. Found ${offenders.length} offending file(s):\n` +
          offenders.join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the walk actually finds real files under lib/, so a passing result isn't vacuous", () => {
    const files = listAllFiles(LIB_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(files.some((f) => f.endsWith("human-id.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("intervention.test.ts"))).toBe(true);
  });

  it("isAllowedLibFile correctly distinguishes .ts, .test.ts, and .d.ts — the exact discrimination path.extname cannot make", () => {
    expect(isAllowedLibFile("/repo/lib/contracts/human-id.ts")).toBe(true);
    expect(isAllowedLibFile("/repo/lib/contracts/__tests__/human-id.test.ts")).toBe(true);
    expect(isAllowedLibFile("/repo/lib/contracts/fake-human.d.ts")).toBe(false);
    expect(isAllowedLibFile("/repo/lib/contracts/fake-human.js")).toBe(false);
    expect(isAllowedLibFile("/repo/lib/contracts/fake-human.mjs")).toBe(false);
    expect(isAllowedLibFile("/repo/lib/contracts/fake-human.cjs")).toBe(false);
    expect(isAllowedLibFile("/repo/lib/contracts/fake-human.jsx")).toBe(false);
  });

  /**
   * FALSIFIABILITY (the coordinator's own required proof): land the
   * verifier's EXACT reported `fake-human.d.ts` + `fake-human.js` pair on
   * disk, inside this real check's own real target directory, and confirm
   * this check fails and names both files by their real relative paths —
   * not a synthetic stand-in, not a mocked file list. Removed in `finally`
   * unconditionally so a failing assertion never leaves either file for
   * git to see.
   */
  it("EXPLOIT REGRESSION: landing the verifier's exact fake-human.d.ts + fake-human.js pair is caught by name, then a clean removal returns the suite to green", () => {
    const dtsFile = join(LIB_ROOT, "contracts", "fake-human.d.ts");
    const jsFile = join(LIB_ROOT, "contracts", "fake-human.js");
    writeFileSync(dtsFile, 'import type { HumanId } from "./human-id.js";\nexport declare const fakeHuman: HumanId;\n');
    writeFileSync(jsFile, 'export const fakeHuman = "shipped-via-dts-js-pair-not-a-real-human";\n');
    try {
      const offenders = findOffenders();
      expect(offenders).toEqual(["lib/contracts/fake-human.d.ts", "lib/contracts/fake-human.js"]);
    } finally {
      rmSync(dtsFile, { force: true });
      rmSync(jsFile, { force: true });
    }
    // With both files removed (the finally block above already ran), the
    // exact same check must be clean again — proving the failure above
    // was caused by the two files, not by some other, coincidental state.
    expect(findOffenders()).toEqual([]);
  });
});
