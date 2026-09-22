import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportExpression,
  isStringLiteralLikeNode,
  type Expression,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { API, type Project } from "typescript/unstable/sync";

/**
 * L4 VERIFY (round 5) reported that round 4's file-inventory check
 * ("no non-`.ts` file can exist under `lib/`") closed the wrong half of
 * the boundary: it constrains what FILES may exist INSIDE `lib/`, but
 * nothing constrained what a `lib/` `.ts` file may IMPORT from outside
 * it —
 *
 *     // scripts/external-human.d.ts   — outside lib/, inventory never walks it
 *     export declare const externalFakeHuman: HumanId;
 *     // scripts/external-human.js
 *     export const externalFakeHuman = "smuggled-from-outside-lib-entirely";
 *     // lib/contracts/attackE.ts      — no cast, no any, no generic
 *     import { externalFakeHuman } from "../../scripts/external-human.js";
 *     export const attackE: HumanId = externalFakeHuman;
 *
 * `attackE.ts` typechecks clean and `externalFakeHuman` is a real runtime
 * string satisfying `assertValidHaltForced`. Round 4's own header claim —
 * "no file left for a lie to hide in" — was FALSE AS WRITTEN: the lie
 * simply moved one directory up, into a `.d.ts`/`.js` pair round 4 never
 * claimed to constrain at all (it only ever walked `lib/`, by design).
 *
 * THE FIX: `lib/` must be a CLOSED MODULE GRAPH — every import anywhere
 * under `lib/**` (source or test) must resolve either INSIDE `lib/**` or
 * to an EXPLICITLY ALLOWLISTED external dependency. Composed with
 * `file-inventory.test.ts` (no non-`.ts` file inside `lib/`), this is a
 * real closure, not a new, movable boundary: no non-`.ts` file can exist
 * inside `lib/`, AND no import can reach outside it — there is no "one
 * directory up" left, because up is no longer reachable. Neither check
 * closes this axis alone; both together do.
 *
 * `ALLOWED_EXTERNAL_SPECIFIERS` below is exactly what `lib/**` actually
 * imports TODAY (`node:fs`, `node:os`, `node:path`, `vitest`,
 * `typescript/unstable/sync`, `typescript/unstable/ast` — `node:os` is
 * this very file's own, for the symlink-escape regression test below,
 * the same real need shadow-run's own architecture test has for the
 * identical reason), enumerated by grepping every real `import` in this
 * milestone's own source before writing this list — not a speculative
 * allowance for what a later
 * milestone might want. `.genesis/PLAN.md` §6 already commits to `lib/`
 * being framework-free; this check makes that commitment mechanically
 * verifiable, which is a reason to keep it independent of this specific
 * attack.
 *
 * THE TRAP THIS FILE'S OWN DESIGN IS BUILT AROUND, NAMED DIRECTLY: a
 * sibling project's import-allowlist check ONCE pattern-matched specifier
 * SYNTAX (does the string start with "./" or "../"?) and was defeated by
 * `../../node_modules/next/package.json`, which matches that pattern
 * while resolving OUTSIDE the allowed tree entirely — the same shape this
 * round's own `attackE` trio uses, one repo over. This file therefore
 * checks CONTAINMENT, never syntax: every relative specifier is resolved
 * to a real, absolute, `realpathSync`'d path and compared against
 * `LIB_ROOT`, not reasoned about by counting `../` segments. See
 * `resolvesInsideLib`/`resolvesToRealLibPath` below — the same two-step
 * (textual containment, then symlink-resistant real-path containment)
 * that sibling's own, later-hardened check uses, reused here because it
 * is proven, not reinvented.
 *
 * Scaffolding (the `API`/`Project`/AST-walk, the fail-closed
 * `getSyntacticDiagnostics` check) matches `human-id.test.ts`'s and
 * `file-inventory.test.ts`'s own — see those files for why
 * `typescript@7.0.2` requires this API surface at all.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");
const TSCONFIG_LIB = join(REPO_ROOT, "tsconfig.lib.json");
/** `LIB_ROOT`, realpath'd once at module load — see shadow-run's own precedent for why comparing a realpath'd candidate against a non-normalized root would misfire the moment the repository itself sits under a symlink (common on macOS, where `/tmp` is itself a symlink to `/private/tmp`). */
const REAL_LIB_ROOT = realpathSync(LIB_ROOT);

/**
 * Exactly what `lib/**` imports today, confirmed by grepping every real
 * `import`/`export ... from` in this milestone's own source before
 * writing this list (`grep -rn '^import' lib/`). Adding a new external
 * dependency to `lib/` requires adding it here, deliberately — the same
 * "enumerate what is actually imported today, not what might be wanted
 * later" discipline the coordinator's own ruling asks for.
 */
const ALLOWED_EXTERNAL_SPECIFIERS: ReadonlySet<string> = new Set([
  "node:fs",
  "node:os",
  "node:path",
  "vitest",
  "typescript/unstable/sync",
  "typescript/unstable/ast",
]);

function listAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listAllTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

class UnparseableFileError extends Error {
  constructor(file: string, diagnosticMessages: readonly string[]) {
    super(
      `could not parse ${file} as valid TypeScript — refusing to scan it as if it were clean ` +
        `(${diagnosticMessages.length} syntax diagnostic(s)): ${diagnosticMessages.join("; ")}`,
    );
    this.name = "UnparseableFileError";
  }
}

let api: API;
beforeAll(() => {
  api = new API();
});
afterAll(() => {
  api.close();
});

interface FoundSpecifier {
  readonly specifier: string;
  readonly line: number;
}

/**
 * Extracts every import-shaped specifier in `file`: a static
 * `import ... from "x"` (including side-effect-only `import "x"`), an
 * `export ... from "x"` / `export * from "x"` re-export, an
 * `import x = require("x")`, a dynamic `import("x")`, and a bare
 * `require("x")` call — the closed, finite set of ways TypeScript/
 * JavaScript spells "import a module" at all (unlike the branded-type
 * forgery problem, this set has an end, fixed by the language grammar).
 * Fails closed on any syntactic diagnostic, same discipline as
 * `human-id.test.ts`/`file-inventory.test.ts`.
 */
function analyzeFileWith(usingApi: API, file: string): { specifiers: readonly FoundSpecifier[] } {
  const snapshot = usingApi.updateSnapshot({ openProjects: [TSCONFIG_LIB], openFiles: [file] });
  const project: Project | undefined = snapshot.getProject(TSCONFIG_LIB);
  const sf: SourceFile | undefined = project?.program.getSourceFile(file);
  if (!project || !sf) {
    throw new Error(`analyzeFile: the real compiler could not load/parse ${file} as part of ${TSCONFIG_LIB}`);
  }

  const diagnostics = project.program.getSyntacticDiagnostics(file);
  if (diagnostics.length > 0) {
    usingApi.updateSnapshot({ closeFiles: [file] });
    throw new UnparseableFileError(file, diagnostics.map((d) => d.text));
  }

  const specifiers: FoundSpecifier[] = [];
  const lineOf = (node: Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  function recordSpecifier(expr: Expression | undefined): void {
    if (!expr) return;
    if (isStringLiteralLikeNode(expr)) {
      specifiers.push({ specifier: expr.text, line: lineOf(expr) });
    } else {
      // A non-literal (dynamically computed) specifier — recorded under
      // its own raw source text so `resolvesInsideLib` rejects it for not
      // looking like a relative specifier, rather than silently having
      // nothing to check.
      specifiers.push({ specifier: expr.getText(sf), line: lineOf(expr) });
    }
  }

  function visit(node: Node): void {
    if (isImportDeclaration(node)) {
      recordSpecifier(node.moduleSpecifier);
    } else if (isExportDeclaration(node)) {
      recordSpecifier(node.moduleSpecifier);
    } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
      recordSpecifier(node.moduleReference.expression);
    } else if (isCallExpression(node)) {
      if (isImportExpression(node.expression)) {
        recordSpecifier(node.arguments[0]);
      } else if (isIdentifier(node.expression) && node.expression.text === "require") {
        recordSpecifier(node.arguments[0]);
      }
    }
    node.forEachChild(visit);
  }
  visit(sf);
  usingApi.updateSnapshot({ closeFiles: [file] });
  return { specifiers };
}

/** The SECOND check `resolvesInsideLib` runs, only on a path that already passed the textual one — tries the exact resolved leaf first (a symlink placed AT that name), falls back to the enclosing directory if the exact leaf doesn't exist (this repo's own `.js`-specifier/`.ts`-file convention — a real import site names `./human-id.js` for the real `human-id.ts` file), and fails closed if NEITHER resolves to anything real. Identical two-step to shadow-run's own `resolvesToRealAllowedPath`, reused because it is proven against exactly this class of attack, not reinvented. */
function resolvesToRealLibPath(resolved: string): boolean {
  try {
    const real = realpathSync(resolved);
    return real === REAL_LIB_ROOT || real.startsWith(REAL_LIB_ROOT + sep);
  } catch {
    // Falls through to the directory-level attempt below.
  }
  try {
    const real = realpathSync(dirname(resolved));
    return real === REAL_LIB_ROOT || real.startsWith(REAL_LIB_ROOT + sep);
  } catch {
    return false; // FAIL CLOSED: neither the leaf nor its enclosing directory resolves to anything real.
  }
}

/**
 * CONTAINMENT, NEVER SYNTAX (see file header): a specifier is allowed iff
 * (1) it is syntactically relative and resolving it against `fromFile`'s
 * real directory lands TEXTUALLY inside `LIB_ROOT`, AND that same path
 * also lands inside `LIB_ROOT` once symlinks are followed
 * (`resolvesToRealLibPath`) — OR (2) it is exactly one of
 * `ALLOWED_EXTERNAL_SPECIFIERS`. Everything else — a bare package name
 * not on the allowlist, an absolute path, a relative path that escapes
 * `lib/` however many `../` segments it takes — is rejected.
 */
function resolvesInsideLib(fromFile: string, specifier: string): boolean {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const resolved = resolve(dirname(fromFile), specifier);
    const textuallyContained = resolved === LIB_ROOT || resolved.startsWith(LIB_ROOT + sep);
    if (!textuallyContained) return false;
    return resolvesToRealLibPath(resolved);
  }
  return ALLOWED_EXTERNAL_SPECIFIERS.has(specifier);
}

interface SpecifierOffender {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
}

interface ParseOffender {
  readonly file: string;
  readonly message: string;
}

/**
 * Takes an explicit `usingApi`, defaulting to the shared, long-lived
 * `api` — see `analyzeScratchScan`'s own comment below for why the
 * `attackE` exploit-regression test below must NOT use that default: a
 * project, once opened through a given `API` instance, does not pick up
 * a file created after that instance's first open (confirmed empirically
 * while building `human-id.test.ts` — see that file's own comments and
 * `.genesis/decisions/0001-contracts.md` Decision 2 for the full
 * incident), so a file written to `lib/` mid-suite (`attackE.ts`) needs
 * its own fresh `API` to be seen at all.
 */
function scan(usingApi: API = api): { specifierOffenders: SpecifierOffender[]; parseOffenders: ParseOffender[] } {
  const specifierOffenders: SpecifierOffender[] = [];
  const parseOffenders: ParseOffender[] = [];
  for (const file of listAllTsFiles(LIB_ROOT)) {
    let result: { specifiers: readonly FoundSpecifier[] };
    try {
      result = analyzeFileWith(usingApi, file);
    } catch (error) {
      if (error instanceof UnparseableFileError) {
        parseOffenders.push({ file: relative(REPO_ROOT, file), message: error.message });
        continue;
      }
      throw error;
    }
    for (const { specifier, line } of result.specifiers) {
      if (!resolvesInsideLib(file, specifier)) {
        specifierOffenders.push({ file: relative(REPO_ROOT, file), line, specifier });
      }
    }
  }
  return { specifierOffenders, parseOffenders };
}

describe("lib/** is a closed module graph — every import resolves inside lib/ or to an explicitly allowlisted dependency", () => {
  it("every import/require/re-export specifier under lib/ resolves inside lib/ or is on the external allowlist", () => {
    const { specifierOffenders } = scan();
    if (specifierOffenders.length > 0) {
      const report = specifierOffenders.map((o) => `${o.file}:${o.line}: imports "${o.specifier}"`).join("\n");
      throw new Error(
        `lib/** may only import a specifier that resolves inside lib/ or is on the explicit external ` +
          `allowlist (${[...ALLOWED_EXTERNAL_SPECIFIERS].join(", ")}) — found ${specifierOffenders.length} ` +
          `offending import(s):\n${report}`,
      );
    }
    expect(specifierOffenders).toEqual([]);
  });

  it("every file under lib/ parses as valid TypeScript — an unparseable file is an automatic offender", () => {
    const { parseOffenders } = scan();
    expect(parseOffenders).toEqual([]);
  });

  it("sanity: the scan actually walks real files under lib/, including __tests__", () => {
    const files = listAllTsFiles(LIB_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(files.some((f) => f.endsWith("intervention.ts"))).toBe(true);
    expect(files.some((f) => f.includes("__tests__"))).toBe(true);
  });

  it("sanity: this repo's own lib/ passes right now (a true positive on the real codebase)", () => {
    const { specifierOffenders, parseOffenders } = scan();
    expect(specifierOffenders).toEqual([]);
    expect(parseOffenders).toEqual([]);
  });

  describe("containment, not syntax — the sibling project's own historical trap, confirmed closed here", () => {
    const FROM_CONTRACTS = join(LIB_ROOT, "contracts", "some-file.ts");

    it("accepts a relative specifier that resolves inside lib/", () => {
      expect(resolvesInsideLib(FROM_CONTRACTS, "./human-id.js")).toBe(true);
      expect(resolvesInsideLib(FROM_CONTRACTS, "../contracts/ids.js")).toBe(true);
    });

    it("accepts exactly the external specifiers lib/ actually uses today, and nothing else bare", () => {
      for (const specifier of ALLOWED_EXTERNAL_SPECIFIERS) {
        expect(resolvesInsideLib(FROM_CONTRACTS, specifier)).toBe(true);
      }
      expect(resolvesInsideLib(FROM_CONTRACTS, "node:crypto")).toBe(false);
      expect(resolvesInsideLib(FROM_CONTRACTS, "fs")).toBe(false);
      expect(resolvesInsideLib(FROM_CONTRACTS, "react")).toBe(false);
      expect(resolvesInsideLib(FROM_CONTRACTS, "some-package-invented-tomorrow")).toBe(false);
    });

    it("EXPLOIT REGRESSION (this account's own precedent): a SYNTACTICALLY relative specifier that resolves outside lib/, into the real node_modules/, is rejected — matches the sibling's own HIGH-2 finding, reproduced here rather than assumed fixed by analogy", () => {
      const specifier = "../../node_modules/next/package.json";
      const resolved = resolve(dirname(FROM_CONTRACTS), specifier);
      expect(existsSync(resolved)).toBe(true);
      expect(resolved.startsWith(LIB_ROOT + sep)).toBe(false);
      expect(resolvesInsideLib(FROM_CONTRACTS, specifier)).toBe(false);
    });

    it("EXPLOIT REGRESSION: a real symlink inside lib/, pointing outside the repository, is rejected once dereferenced", () => {
      const symlinkName = "__zz_import_containment_symlink_do_not_commit__";
      const symlinkPath = join(LIB_ROOT, "contracts", symlinkName);
      const externalTarget = mkdtempSync(join(tmpdir(), "act-import-containment-symlink-"));
      writeFileSync(join(externalTarget, "evil.js"), "export default 1;\n");
      try {
        symlinkSync(externalTarget, symlinkPath, "dir");
        const specifier = `./${symlinkName}/evil.js`;
        const resolved = resolve(dirname(FROM_CONTRACTS), specifier);
        expect(resolved.startsWith(LIB_ROOT + sep)).toBe(true); // textually contained
        expect(realpathSync(resolved).startsWith(REAL_LIB_ROOT + sep)).toBe(false); // really is not
        expect(resolvesInsideLib(FROM_CONTRACTS, specifier)).toBe(false);
      } finally {
        rmSync(symlinkPath, { force: true, recursive: true });
        rmSync(externalTarget, { recursive: true, force: true });
      }
    });

    it("FAIL CLOSED: a specifier whose target does not exist under any name — leaf or enclosing directory — is rejected, not waved through", () => {
      expect(resolvesInsideLib(FROM_CONTRACTS, "./totally-nonexistent-dir/also-nonexistent.js")).toBe(false);
    });

    it("does not regress the .js-specifier-to-.ts-file convention this codebase actually uses", () => {
      expect(existsSync(join(LIB_ROOT, "contracts", "ids.js"))).toBe(false);
      expect(existsSync(join(LIB_ROOT, "contracts", "ids.ts"))).toBe(true);
      expect(resolvesInsideLib(FROM_CONTRACTS, "./ids.js")).toBe(true);
    });
  });

  /**
   * EXPLOIT REGRESSION — THE EXACT REPORTED `attackE` TRIO, PROVED LIVE.
   * Writes the verifier's own three files verbatim (two OUTSIDE lib/,
   * under a real `scripts/` directory at the repo root, plus the
   * importing file inside `lib/contracts/`), confirms this scan's real
   * `scan()` — the same one the first test in this file runs — finds it
   * and names both the file and the offending specifier, then removes all
   * three and confirms the suite is clean again. Cleanup runs in
   * `finally` unconditionally.
   */
  it("EXPLOIT REGRESSION: the exact reported attackE trio (an outside-lib/ .d.ts/.js pair, imported by a lib/ file with no cast) is caught by file and specifier", () => {
    const scriptsDir = join(REPO_ROOT, "scripts");
    const dtsFile = join(scriptsDir, "external-human.d.ts");
    const jsFile = join(scriptsDir, "external-human.js");
    const attackFile = join(LIB_ROOT, "contracts", "attackE.ts");
    const scriptsDirPreexisted = existsSync(scriptsDir);
    try {
      if (!scriptsDirPreexisted) {
        mkdirSync(scriptsDir, { recursive: true });
      }
      writeFileSync(dtsFile, 'export declare const externalFakeHuman: HumanId;\n');
      writeFileSync(jsFile, 'export const externalFakeHuman = "smuggled-from-outside-lib-entirely";\n');
      writeFileSync(
        attackFile,
        [
          'import type { HumanId } from "./human-id.js";',
          'import { externalFakeHuman } from "../../scripts/external-human.js";',
          "export const attackE: HumanId = externalFakeHuman;",
        ].join("\n") + "\n",
      );

      // A FRESH API instance, not the shared `api` — the shared one's
      // project was already opened by earlier tests in this file, before
      // attackE.ts existed on disk, and (confirmed empirically — see
      // `scan`'s own doc comment) does not pick up a file created after
      // its first open. The file already exists on disk before this
      // instance is even constructed, so its first-ever open — the one
      // that works — is the only open it needs.
      const scratchApi = new API();
      try {
        const { specifierOffenders } = scan(scratchApi);
        const attackOffender = specifierOffenders.find((o) => o.file === "lib/contracts/attackE.ts");
        expect(attackOffender).toBeDefined();
        expect(attackOffender?.specifier).toBe("../../scripts/external-human.js");
      } finally {
        scratchApi.close();
      }
    } finally {
      rmSync(attackFile, { force: true });
      rmSync(dtsFile, { force: true });
      rmSync(jsFile, { force: true });
      if (!scriptsDirPreexisted) {
        rmSync(scriptsDir, { recursive: true, force: true });
      }
    }
    // With all three removed, a fresh scan (fresh API again, for the same
    // reason) must be clean again.
    const cleanApi = new API();
    try {
      const { specifierOffenders: afterRemoval } = scan(cleanApi);
      expect(afterRemoval).toEqual([]);
    } finally {
      cleanApi.close();
    }
  });
});
