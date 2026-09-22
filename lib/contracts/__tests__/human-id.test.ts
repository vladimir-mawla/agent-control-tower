import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isAsExpression,
  isTypeAliasDeclaration,
  isTypeAssertion,
  isTypeReferenceNode,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { API, SymbolFlags, type Checker, type Project, type Symbol as TsSymbol } from "typescript/unstable/sync";

/**
 * L4 VERIFY (independent review) REJECTED the first version of this file.
 * It scanned for the literal substring `` `as HumanId` `` and was defeated
 * in one line, undetected:
 *
 *     import type { HumanId as HID } from "./human-id.js";
 *     export function mintFakeHuman(raw: string): HID {
 *       return raw as HID;
 *     }
 *
 * `typecheck` clean, `npm test` green, the old scan never fired — because
 * it matched TEXT, and the cast never spells the four characters
 * `HumanId` at the call site once the import is aliased. The verifier's
 * own framing matters as much as the bug: "do not chase the text... a
 * sibling project spent six rounds and five distinct bypasses growing
 * exactly that kind of machinery, and the fix that finally held was a
 * net-negative diff that removed the capability instead of defending it."
 * That sibling is `shadow-run` (`lib/simulate/__tests__/architecture.
 * test.ts`), which hit the identical wall — a hand-rolled/text-based
 * scanner has open-ended gaps — for a different property (LLM/network
 * imports, not a branded-type cast) and, after five rounds of patching a
 * tokenizer, replaced it outright with the REAL compiler
 * (`typescript/unstable/sync`'s `API`/`Project`/`Program`, `typescript/
 * unstable/ast`'s `Node#forEachChild`), because `typescript@7.0.2`'s main
 * entry is the native Go compiler and exports none of the classic
 * `ts.createSourceFile`/`ts.createProgram` surface at all — this file
 * reuses that same scaffolding (`analyzeFile`, fail-closed on
 * `getSyntacticDiagnostics`, one `API` instance per test file), because it
 * is a faithful, drop-in precedent for the identical `typescript@7.0.2`
 * this repo also depends on, not a coincidence of naming.
 *
 * WHAT THIS FILE DOES DIFFERENTLY FROM shadow-run's OWN architecture test,
 * AND WHY: shadow-run's guard only needs SYNTACTIC facts (is this node an
 * import declaration, is this call's callee the identifier `fetch`) — it
 * never asks the type checker anything. Catching an ALIASED cast needs
 * SEMANTIC information no syntax tree alone carries: `HID` and `HumanId`
 * are different identifiers in the text, and only the checker knows they
 * name the same declaration. So this file, in addition to shadow-run's
 * `Project`/`Program`/`forEachChild` scaffolding, also uses `Project.
 * checker` (a real `Checker`, exported from `typescript/unstable/sync`)
 * to resolve WHATEVER identifier a cast's target type names back to the
 * original symbol it refers to (`checker.getSymbolAtLocation` +
 * `checker.getAliasedSymbol`, walked repeatedly since an import can be
 * re-exported under yet another name one or more times) and compares that
 * ORIGINAL symbol's identity against `HumanId`'s own real declaration in
 * `human-id.ts` — never against the NAME written at the call site, which
 * is exactly the fact an alias changes and a symbol identity does not.
 *
 * THE CHECK ALSO NO LONGER RESOLVES `checker.getTypeFromTypeNode(node.
 * type).getSymbol()` — tried first, during development of this fix, and
 * empirically confirmed to return `undefined` for a cast target like
 * `HumanId`: a type ALIAS to a structural intersection type
 * (`string & { readonly [brand]: "HumanId" }`) has no symbol once
 * resolved to its structural form — aliases are transparent to the
 * checker's own type identity. The fix that actually works, confirmed
 * against this real repository before being written into this file, is
 * resolving the symbol at the cast's TYPE-NAME NODE itself
 * (`checker.getSymbolAtLocation(typeNode.typeName)`, which returns the
 * LOCAL alias/import symbol, e.g. `HID`) and then following THAT symbol's
 * own alias chain (`checker.getAliasedSymbol`, looped while `SymbolFlags.
 * Alias` is set, capped at 20 hops against a pathological cycle) to reach
 * the ORIGINAL declaration symbol — which is where identity is actually
 * decided.
 *
 * ALSO CLOSED, PRE-EMPTIVELY, BEFORE ANY VERIFIER TRIED IT: a cast whose
 * target type NAMES `HumanId` somewhere inside a wrapper this file's
 * first, narrower attempt (checking only `isTypeReferenceNode(node.type)`
 * directly) would have missed — `"x" as (HumanId)` (parenthesized) is not
 * itself a `TypeReferenceNode`, it is a `ParenthesizedTypeNode` wrapping
 * one. `findHumanIdReferenceIn` (below) walks the ENTIRE type-node subtree
 * of a cast's target, not just its top level, so parenthesization,
 * `HumanId | never`, `Array<HumanId>`, etc. are all still found by the
 * same one check — confirmed directly against a real parenthesized-cast
 * fixture before this file was finalized, not assumed to generalize.
 *
 * FAILS CLOSED ON UNPARSEABLE INPUT, same discipline and same reason as
 * shadow-run's own round 5 (see that file's header in full): a syntax
 * error can make the real parser's error-recovery silently misplace or
 * drop the very node this scan is looking for, so a file with ANY
 * syntactic diagnostic is refused outright as a `parseOffender`, never
 * silently treated as clean.
 *
 * STATED AT ITS TRUE STRENGTH, NOT MORE: this closes the class "the cast
 * target names `HumanId`, however indirectly, aliased, re-exported, or
 * wrapped, ANYWHERE the real TypeScript checker can resolve a symbol from
 * source text it can parse." It does NOT, and architecturally cannot,
 * catch a cast that never names `HumanId` as a type at all — the
 * `halt`/`forced` bypass independent verification separately reported
 * (casting an entire object literal `as unknown as HaltForced`, where the
 * `authorizedBy` field is a plain, never-branded string the WHOLE WAY
 * THROUGH) does not trip this file for exactly that reason, and no
 * text-based or symbol-based scan targeting the `HumanId` brand
 * specifically ever could — that is `intervention.ts`'s own header and
 * `.genesis/decisions/0001-contracts.md` Decision 2's job to state
 * honestly, not this file's to paper over by scope creep into scanning
 * for casts to `HaltForced`/`Intervention` as well (a different,
 * unboundedly larger surface — every closed type in this milestone could
 * be "protected" by the identical argument, which is precisely the
 * open-ended, ever-widening-scanner trap the verifier's own message warns
 * against).
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");
const HUMAN_ID_FILE = join(REPO_ROOT, "lib", "contracts", "human-id.ts");
const SCRATCH_DIR = join(REPO_ROOT, "lib", "contracts", "__tests__");
/**
 * The repo has TWO tsconfigs at its root — `tsconfig.json` (app-facing,
 * `exclude`s `lib/**\/*`) and `tsconfig.lib.json` (the one that actually
 * covers `lib/**\/*.ts`, `.genesis/PLAN.md` §6's own frozen `lib/`
 * config). `Snapshot.getDefaultProjectForFile` was tried first and
 * empirically confirmed (before this constant existed) to silently pick
 * an ad hoc, single-file INFERRED project for a `lib/` file whenever that
 * file wasn't already the current file of a project the API had
 * auto-discovered — `Snapshot.getProjects()` only ever listed
 * `tsconfig.json` and `/dev/null/inferred`, never `tsconfig.lib.json`,
 * confirmed directly against this real repo, not assumed. An inferred
 * project only contains the one opened file plus whatever it directly,
 * transitively imports — so a file that does not itself import
 * `human-id.ts` (most of `lib/contracts/**`) got a project that could
 * never resolve `human-id.ts`'s declaration at all, and every real-file
 * scan failed outright with "could not load human-id.ts as part of the
 * compiled project." The fix: open `tsconfig.lib.json` EXPLICITLY via
 * `openProjects`, and fetch it by name (`Snapshot.getProject`), instead of
 * asking the API to guess which project a given file belongs to.
 */
const TSCONFIG_LIB = join(REPO_ROOT, "tsconfig.lib.json");

function listNonTestSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__") continue; // this directory's own fixtures/specs are exempt — the invariant is about shipped lib/ source, not the test suite proving it.
      files.push(...listNonTestSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

/** Thrown when the real compiler reports ANY syntactic diagnostic for a file — see this file's header for why that must refuse the file outright rather than walk a tree error-recovery may have silently reshaped. Mirrors shadow-run's own `UnparseableFileError` exactly. */
class UnparseableFileError extends Error {
  constructor(file: string, diagnosticMessages: readonly string[]) {
    super(
      `could not parse ${file} as valid TypeScript — refusing to scan it as if it were clean ` +
        `(${diagnosticMessages.length} syntax diagnostic(s)): ${diagnosticMessages.join("; ")}`,
    );
    this.name = "UnparseableFileError";
  }
}

/** One real compiler instance for this whole file — see shadow-run's own architecture test for why this is a `beforeAll`/`afterAll`, not per-assertion. */
let api: API;
beforeAll(() => {
  api = new API();
});
afterAll(() => {
  api.close();
});

/**
 * Walks `symbol`'s own alias chain to whatever it ultimately refers to —
 * an import, a re-export, an aliased import (`X as Y`), or a chain of
 * several, in any combination. Capped at 20 hops: a real alias chain in
 * this milestone is at most one or two hops deep, and a cap turns a
 * pathological/cyclic input into a bounded "stop resolving, compare what
 * we have" rather than an infinite loop — this file's own tests
 * (the re-export-chain case below) confirm the real cases this milestone
 * actually has resolve in one or two hops, well under the cap.
 */
function resolveToOriginalSymbol(symbol: TsSymbol, checker: Checker): TsSymbol {
  let current = symbol;
  let hops = 0;
  while ((current.flags & SymbolFlags.Alias) !== 0 && hops < 20) {
    let next: TsSymbol | undefined;
    try {
      next = checker.getAliasedSymbol(current);
    } catch {
      break;
    }
    if (!next || next.id === current.id) break;
    current = next;
    hops += 1;
  }
  return current;
}

/**
 * Finds `HumanId`'s own declaration symbol inside `human-id.ts`, fresh,
 * from `project`/`checker` — recomputed per `analyzeFile` call rather than
 * cached globally across separate `openFiles`/`closeFiles` cycles, so this
 * never silently relies on an assumption about symbol-id stability across
 * snapshots that this file has not itself verified holds.
 */
function findHumanIdSymbolId(project: Project, checker: Checker): number {
  const sf = project.program.getSourceFile(HUMAN_ID_FILE);
  if (!sf) {
    throw new Error(
      `could not load ${HUMAN_ID_FILE} as part of the compiled project — every check below is meaningless without it`,
    );
  }
  let id: number | undefined;
  function visit(node: Node): void {
    if (isTypeAliasDeclaration(node) && node.name.text === "HumanId") {
      id = checker.getSymbolAtLocation(node.name)?.id;
    }
    node.forEachChild(visit);
  }
  visit(sf);
  if (id === undefined) {
    throw new Error("could not resolve HumanId's own declared symbol in human-id.ts — has the type been renamed? update this test to match.");
  }
  return id;
}

/**
 * Walks the ENTIRE subtree of a cast's target type node (not just its top
 * level — see this file's header for why parenthesization would defeat a
 * shallower check) looking for any `TypeReferenceNode` whose resolved,
 * de-aliased symbol matches `targetId`.
 */
function findHumanIdReferenceIn(typeNode: Node, checker: Checker, targetId: number): boolean {
  let found = false;
  function walk(node: Node): void {
    if (found) return;
    if (isTypeReferenceNode(node)) {
      const localSymbol = checker.getSymbolAtLocation(node.typeName);
      if (localSymbol && resolveToOriginalSymbol(localSymbol, checker).id === targetId) {
        found = true;
        return;
      }
    }
    node.forEachChild(walk);
  }
  walk(typeNode);
  return found;
}

interface FoundCast {
  readonly line: number;
  readonly text: string;
}

/**
 * Parses `file` with `usingApi`, fails closed on any syntactic diagnostic
 * (throws `UnparseableFileError`), then walks every `as` expression and
 * old-style `<T>` type assertion in the file looking for one whose target
 * type resolves — through however many aliases or re-exports — to
 * `HumanId`'s own real declaration.
 *
 * TAKES THE `API` INSTANCE AS A PARAMETER, DELIBERATELY, RATHER THAN
 * ALWAYS USING THIS FILE'S SHARED `api` — see `analyzeScratch`'s own
 * header for why a freshly-written file needs a FRESH `API` instance, not
 * the long-lived shared one `scan()` uses for the real, already-on-disk
 * `lib/` tree.
 */
function analyzeFileWith(usingApi: API, file: string): { casts: readonly FoundCast[] } {
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

  const checker = project.checker;
  const humanIdSymbolId = findHumanIdSymbolId(project, checker);
  const casts: FoundCast[] = [];
  const lineOf = (node: Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  function visit(node: Node): void {
    if ((isAsExpression(node) || isTypeAssertion(node)) && findHumanIdReferenceIn(node.type, checker, humanIdSymbolId)) {
      casts.push({ line: lineOf(node), text: node.getText(sf) });
    }
    node.forEachChild(visit);
  }
  visit(sf);
  usingApi.updateSnapshot({ closeFiles: [file] });
  return { casts };
}

/** `scan()`'s own per-file entry point — always the one shared, long-lived `api` (see `beforeAll`), since the real `lib/` tree it walks is fixed for the whole test run. */
function analyzeFile(file: string): { casts: readonly FoundCast[] } {
  return analyzeFileWith(api, file);
}

/**
 * Runs the same analysis against a real, on-disk snippet placed
 * temporarily inside `lib/contracts/__tests__/` itself (never under OS
 * temp — see this function's own comment below for why it must live
 * inside the real project). Placed inside `__tests__/` so it is excluded
 * from `listNonTestSourceFiles`'s own real scan (never double-counted as
 * a real offender in `lib/`) and removed in `finally` unconditionally, so
 * a failing assertion never leaves a stray file for git to see.
 *
 * USES A FRESH, ONE-OFF `API` INSTANCE, NEVER THE SHARED `api` — confirmed
 * empirically, not assumed, that this matters: once a project has been
 * opened once through a given `API` instance, re-passing `openProjects`
 * for the SAME config path (even after `closeProjects` and
 * `clearSourceFileCache()`) does NOT re-run the config's include glob, so
 * a file that did not exist on disk yet the FIRST time that instance
 * opened the project stays invisible to `project.program` for the rest of
 * that instance's life. A brand-new `API()` per scratch analysis sidesteps
 * this entirely: the file already exists on disk (written before the
 * instance is even constructed), so the FIRST open — proven to work
 * correctly — is the only open it ever needs to do. The small per-call
 * cost (spinning up a fresh compiler instance, tens of milliseconds per
 * shadow-run's own architecture test) is worth paying for roughly a dozen
 * synthetic checks rather than silently reusing a stale, already-globbed
 * project and reporting a false "no cast found" for every exploit
 * fixture — which is exactly the failure this repository's own account
 * history warns hardest against: a check that always reports clean is
 * worse than no check.
 */
function analyzeScratch(source: string): { casts: readonly FoundCast[] } {
  const file = join(SCRATCH_DIR, `__scratch_${Math.random().toString(36).slice(2)}__.ts`);
  writeFileSync(file, source);
  const scratchApi = new API();
  try {
    return analyzeFileWith(scratchApi, file);
  } finally {
    scratchApi.close();
    rmSync(file, { force: true });
  }
}

interface CastOffender {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

interface ParseOffender {
  readonly file: string;
  readonly message: string;
}

function scan(): { castOffenders: CastOffender[]; parseOffenders: ParseOffender[] } {
  const castOffenders: CastOffender[] = [];
  const parseOffenders: ParseOffender[] = [];
  for (const file of listNonTestSourceFiles(LIB_ROOT)) {
    let result: { casts: readonly FoundCast[] };
    try {
      result = analyzeFile(file);
    } catch (error) {
      if (error instanceof UnparseableFileError) {
        parseOffenders.push({ file: relative(REPO_ROOT, file), message: error.message });
        continue;
      }
      throw error;
    }
    for (const { line, text } of result.casts) {
      castOffenders.push({ file: relative(REPO_ROOT, file), line, text });
    }
  }
  return { castOffenders, parseOffenders };
}

describe("HumanId is never fabricated via a cast anywhere in lib/ non-test source — resolved by the real type checker, not by text", () => {
  it("no cast resolving to HumanId's own symbol appears outside a *.test.ts file", () => {
    const { castOffenders } = scan();
    if (castOffenders.length > 0) {
      const report = castOffenders.map((o) => `${o.file}:${o.line}: ${o.text}`).join("\n");
      throw new Error(
        `Found a cast that resolves to HumanId's own declared symbol outside a test file. HumanId has no ` +
          `minting function anywhere in lib/ (see human-id.ts) precisely so no engine milestone can fabricate a ` +
          `human authorization:\n${report}`,
      );
    }
    expect(castOffenders).toEqual([]);
  });

  it("every non-test source file under lib/ parses as valid TypeScript — an unparseable file is an automatic offender, never silently treated as clean", () => {
    const { parseOffenders } = scan();
    if (parseOffenders.length > 0) {
      const report = parseOffenders.map((o) => `${o.file}: ${o.message}`).join("\n");
      throw new Error(`lib/ contains file(s) this guard could not parse as valid TypeScript:\n${report}`);
    }
    expect(parseOffenders).toEqual([]);
  });

  it("sanity: the scan actually walks real files under lib/, excluding __tests__", () => {
    const files = listNonTestSourceFiles(LIB_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files.some((f) => f.endsWith("intervention.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("human-id.ts"))).toBe(true);
    expect(files.some((f) => f.includes("__tests__"))).toBe(false);
  });

  it("sanity: this repo's own lib/ source passes both checks right now (a true positive on the real codebase, not just synthetic fixtures)", () => {
    const { castOffenders, parseOffenders } = scan();
    expect(castOffenders).toEqual([]);
    expect(parseOffenders).toEqual([]);
  });

  describe("EXPLOIT REGRESSION (independent verification): the exact reported bypasses, confirmed caught", () => {
    it("[reported bypass] an aliased type-only import, cast through the alias's own local name, is caught", () => {
      const source = [
        'import type { HumanId as HID } from "../human-id.js";',
        "export function mintFakeHuman(raw: string): HID {",
        "  return raw as HID;",
        "}",
      ].join("\n");
      const { casts } = analyzeScratch(source);
      expect(casts).toEqual([{ line: 3, text: "raw as HID" }]);
    });

    it("the old-style `<T>` assertion form is caught through the same alias", () => {
      const source = ['import type { HumanId as HID } from "../human-id.js";', 'export const x = <HID>"bob";'].join("\n");
      const { casts } = analyzeScratch(source);
      expect(casts).toHaveLength(1);
    });

    it("a re-export chain (alias of an alias) is still caught — the checker follows every hop, not just one", () => {
      const reExportFile = join(SCRATCH_DIR, `__scratch_reexport_${Math.random().toString(36).slice(2)}__.ts`);
      writeFileSync(reExportFile, 'export type { HumanId as ReExported } from "../human-id.js";\n');
      try {
        const relSpecifier = `./${relative(SCRATCH_DIR, reExportFile).replace(/\.ts$/, ".js")}`;
        const source = [
          `import type { ReExported as DoublyAliased } from "${relSpecifier}";`,
          'export const x = "eve" as DoublyAliased;',
        ].join("\n");
        const { casts } = analyzeScratch(source);
        expect(casts).toEqual([{ line: 2, text: '"eve" as DoublyAliased' }]);
      } finally {
        rmSync(reExportFile, { force: true });
      }
    });

    it("a parenthesized cast target does not evade detection either (`as (HumanId)`, not itself a bare TypeReferenceNode)", () => {
      const source = ['import type { HumanId } from "../human-id.js";', 'export const x = "carol" as (HumanId);'].join("\n");
      const { casts } = analyzeScratch(source);
      expect(casts).toHaveLength(1);
    });

    it("an un-aliased, direct cast is still caught (the original, simpler case this check has always covered)", () => {
      const source = ['import type { HumanId } from "../human-id.js";', 'export const x = "alice" as HumanId;'].join("\n");
      const { casts } = analyzeScratch(source);
      expect(casts).toEqual([{ line: 2, text: '"alice" as HumanId' }]);
    });
  });

  describe("false-positive discipline: only a cast that REALLY resolves to HumanId's own symbol, never a name collision or a comment", () => {
    it("does NOT flag a comment that spells the phrase 'as HumanId' in prose — this is the exact incident recorded in this milestone's ADR (Decision 2), now closed structurally rather than by careful wording", () => {
      const source = ["// a comment that says `raw as HumanId` should never trip this scan", "export const x = 1;"].join("\n");
      const { casts } = analyzeScratch(source);
      expect(casts).toEqual([]);
    });

    it("does NOT flag a cast to a DIFFERENT, locally-declared type that merely happens to share the name 'HumanId' — proves this is identity-based, not name-based (the exact class of false positive a text/regex scan cannot avoid)", () => {
      const source = ["type HumanId = number;", "export const x = 5 as HumanId;"].join("\n");
      const { casts } = analyzeScratch(source);
      expect(casts).toEqual([]);
    });

    it("does NOT flag an ordinary cast to an unrelated type", () => {
      const source = ['export const x = "hello" as unknown as number;'].join("\n");
      const { casts } = analyzeScratch(source);
      expect(casts).toEqual([]);
    });
  });

  describe("fails closed on syntactically invalid input, same discipline as shadow-run's own architecture test", () => {
    it("a syntax error hiding a real cast is refused outright, never silently scanned as clean", () => {
      const exploit = ["function broken( {", 'import type { HumanId as HID } from "../human-id.js";', "export const x = 1 as HID;"].join("\n");
      expect(() => analyzeScratch(exploit)).toThrow(UnparseableFileError);
    });

    it("does NOT overtighten: the equivalent syntactically valid input still scans normally", () => {
      const control = ['import type { HumanId as HID } from "../human-id.js";', "export const x = 1 as HID;"].join("\n");
      expect(analyzeScratch(control).casts).toHaveLength(1);
    });
  });
});
