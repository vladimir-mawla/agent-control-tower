import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isArrowFunction,
  isFunctionDeclaration,
  isFunctionExpression,
  isIndexSignatureDeclaration,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isParameterDeclaration,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  type Node,
  type SourceFile,
  type TypeNode,
} from "typescript/unstable/ast";
import { API, isStringLiteralType, isUnionType, type Project, type Type } from "typescript/unstable/sync";

/**
 * L4 VERIFY (independent review) REJECTED `__tests__/architecture.test.ts`'s
 * own claim of sufficiency, with a real, reproduced route that file cannot
 * see and does not claim to:
 *
 *     import type { Intervention } from "../contracts/intervention.js";
 *     type HaltVariant = Extract<Intervention, { kind: "halt" }>;
 *     export type HiddenHaltMode = HaltVariant["mode"];   // includes the human-authorized literal
 *
 * This is ORDINARY, IDIOMATIC TYPESCRIPT — not an attack, not a cast, not
 * `any`. `HiddenHaltMode` resolves, by ordinary type computation
 * (`Extract`, then an indexed access), to the exact literal-string union
 * `architecture.test.ts`'s plain text scan exists to catch — with that
 * literal spelled NOWHERE in this source text. `.genesis/decisions/
 * 0004-gate.md` Decision 6 named the general shape ("the literal need
 * never appear at all when the type is reached by computation") but had
 * not, before this file, built a check for it. This file is that check.
 *
 * WHY THIS IS A DIFFERENT CLASS FROM `human-id.test.ts`'s IDENTIFIER-
 * ALIASING PROBLEM, AND FROM `architecture.test.ts`'s OWN DISCLOSED
 * RUNTIME-STRING-ASSEMBLY LIMIT: aliasing changes what NAME a reader sees
 * at a call site while the underlying SYMBOL stays the same (solved by
 * resolving symbol identity through the checker). Runtime string assembly
 * (`"for" + "ced"`) produces a value with NO type-level trace in source at
 * all (undecidable in general — the same "not enumerable" class this
 * account has already refused to chase once, for a different property).
 * TYPE COMPUTATION is neither: `Extract<Intervention, {...}>["mode"]` is a
 * plain, syntactically ordinary type expression whose RESOLVED TYPE the
 * real checker can compute exactly, every time, with no ambiguity — the
 * question "does this type annotation's resolved type include the
 * forbidden literal" is DECIDABLE, not an open-ended chase. That is why
 * this file exists where `architecture.test.ts`'s own text scan does not
 * attempt to, and why it is not the same kind of scope creep M1's
 * coordinator forbade for `human-id.test.ts`'s routes A/B (an
 * unenumerable class) — see `.genesis/decisions/0004-gate.md` Decision 6
 * for the argument made in full, including why a closed, decidable check
 * is not an arms race the way chasing an unenumerable one would be.
 *
 * WHAT THIS FILE CHECKS: for every TYPE ANNOTATION position this
 * milestone's own non-test source can write one in — a type alias's own
 * type, a variable/property/parameter/index-signature's declared type, or
 * a function/method/arrow function's declared return type — this file
 * asks the real checker what that annotation's type RESOLVES to, and
 * fails if that resolved type is, or is a union containing, the exact
 * string-literal type this project's `Intervention["mode"]` union uses to
 * name its highest-risk halt variant. This is symmetric with, and
 * independent of, `available-interventions.ts`'s own `Exclude<>`-derived
 * return type (the actual, load-bearing guarantee — see that file's and
 * `0004-gate.md`'s own headers) and `architecture.test.ts`'s plain text
 * scan (a different, narrower layer, redundant with this one only for the
 * subset of cases where the literal also appears in source text).
 *
 * WHAT THIS FILE DOES NOT, AND CANNOT, CATCH — DISCLOSED, NOT PAPERED
 * OVER: a generic-helper cast that names the target type only as a type
 * ARGUMENT at its OWN call site (`unsafeCast<AvailableInterventionKind>(x.
 * mode)`) has no TYPE ANNOTATION position anywhere for this scan to
 * inspect — `x.mode` is an EXPRESSION, not a type node, and the generic's
 * own internal `return x as T` targets a type PARAMETER, not this
 * project's literal, the identical shape `human-id.ts`'s own disclosed
 * "route B" already names for `HumanId` and this account already ruled,
 * once, not worth chasing further (an open-ended class: `any`, a generic
 * instantiated at its call site, `JSON.parse`, and now this same shape
 * applied to a plain string-literal union instead of a branded type).
 * This file's own "DISCLOSED LIMIT" describe block below reproduces that
 * exact route and confirms, with a real, passing assertion, that it is
 * not caught — the same discipline `human-id.test.ts`/`architecture.
 * test.ts` already use for their own honest residuals.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const GATE_ROOT = join(REPO_ROOT, "lib", "gate");
const SCRATCH_DIR = join(REPO_ROOT, "lib", "gate", "__tests__");
const TSCONFIG_LIB = join(REPO_ROOT, "tsconfig.lib.json");
const FORBIDDEN_LITERAL = "forced";

function listNonTestSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__") continue;
      files.push(...listNonTestSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
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

/**
 * The one type-annotation-bearing node kinds this milestone's own
 * non-test source could plausibly use: a type alias's own type, a
 * variable/property/parameter/index-signature's declared type, or a
 * function-shaped declaration's own return type. Every one of these
 * interfaces carries a `.type` field in the real TypeScript AST — this
 * function narrows to their union via an `||` chain of the real node
 * guards (the same style `human-id.test.ts`/`import-containment.test.ts`
 * already use) rather than duck-typing an untyped `.type` access.
 */
function typeAnnotationOf(node: Node): TypeNode | undefined {
  if (
    isTypeAliasDeclaration(node) ||
    isVariableDeclaration(node) ||
    isPropertyDeclaration(node) ||
    isPropertySignatureDeclaration(node) ||
    isParameterDeclaration(node) ||
    isIndexSignatureDeclaration(node) ||
    isFunctionDeclaration(node) ||
    isArrowFunction(node) ||
    isFunctionExpression(node) ||
    isMethodDeclaration(node) ||
    isMethodSignatureDeclaration(node)
  ) {
    return node.type;
  }
  return undefined;
}

/**
 * Whether `type` IS, or is a union CONTAINING, the exact string-literal
 * type named by `FORBIDDEN_LITERAL` — recursing into unions only (not
 * intersections or object-type properties), because every route this
 * file was built to catch (`Extract`/indexed-access/conditional type
 * computation reaching a string-literal member of `Intervention["mode"]`)
 * resolves, at the checker level, to a plain string-literal type or a
 * union of them — never to an object type with the literal buried inside
 * a property (an object-shaped leak would still expose the literal
 * eventually at whatever position UNWRAPS it to a bare string, which is
 * the position this file actually inspects).
 */
function typeContainsForbiddenLiteral(type: Type, seen: Set<Type> = new Set()): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  if (isStringLiteralType(type)) return type.value === FORBIDDEN_LITERAL;
  if (isUnionType(type)) return type.getTypes().some((member) => typeContainsForbiddenLiteral(member, seen));
  return false;
}

interface FoundLeak {
  readonly line: number;
  readonly text: string;
}

function analyzeFileWith(usingApi: API, file: string): { leaks: readonly FoundLeak[] } {
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
  const leaks: FoundLeak[] = [];
  const lineOf = (node: Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  function visit(node: Node): void {
    const annotation = typeAnnotationOf(node);
    if (annotation) {
      const resolved = checker.getTypeFromTypeNode(annotation);
      if (resolved && typeContainsForbiddenLiteral(resolved)) {
        leaks.push({ line: lineOf(annotation), text: annotation.getText(sf) });
      }
    }
    node.forEachChild(visit);
  }
  visit(sf);
  usingApi.updateSnapshot({ closeFiles: [file] });
  return { leaks };
}

function analyzeFile(file: string): { leaks: readonly FoundLeak[] } {
  return analyzeFileWith(api, file);
}

/** Fresh, one-off `API` instance per scratch analysis — see `human-id.test.ts`'s own comment for why a shared, already-opened project does not pick up a file written after its first open. */
function analyzeScratch(source: string): { leaks: readonly FoundLeak[] } {
  const file = join(SCRATCH_DIR, `__scratch_typeleak_${Math.random().toString(36).slice(2)}__.ts`);
  writeFileSync(file, source);
  const scratchApi = new API();
  try {
    return analyzeFileWith(scratchApi, file);
  } finally {
    scratchApi.close();
    rmSync(file, { force: true });
  }
}

interface LeakOffender {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

interface ParseOffender {
  readonly file: string;
  readonly message: string;
}

function scan(): { leakOffenders: LeakOffender[]; parseOffenders: ParseOffender[] } {
  const leakOffenders: LeakOffender[] = [];
  const parseOffenders: ParseOffender[] = [];
  for (const file of listNonTestSourceFiles(GATE_ROOT)) {
    let result: { leaks: readonly FoundLeak[] };
    try {
      result = analyzeFile(file);
    } catch (error) {
      if (error instanceof UnparseableFileError) {
        parseOffenders.push({ file: relative(REPO_ROOT, file), message: error.message });
        continue;
      }
      throw error;
    }
    for (const { line, text } of result.leaks) {
      leakOffenders.push({ file: relative(REPO_ROOT, file), line, text });
    }
  }
  return { leakOffenders, parseOffenders };
}

describe("no type annotation in lib/gate/**'s non-test source resolves to the human-authorized halt mode's own literal — checked by the real checker, not by text", () => {
  it("no type-alias/variable/property/parameter/return-type annotation resolves to a type containing the forbidden literal", () => {
    const { leakOffenders } = scan();
    if (leakOffenders.length > 0) {
      const report = leakOffenders.map((o) => `${o.file}:${o.line}: ${o.text}`).join("\n");
      throw new Error(
        `Found a type annotation whose RESOLVED type includes the human-authorized halt mode's own literal, ` +
          `reached by type computation rather than by spelling it directly:\n${report}`,
      );
    }
    expect(leakOffenders).toEqual([]);
  });

  it("every non-test source file under lib/gate/ parses as valid TypeScript — an unparseable file is an automatic offender", () => {
    const { parseOffenders } = scan();
    expect(parseOffenders).toEqual([]);
  });

  it("sanity: the scan actually walks real files under lib/gate/, excluding __tests__", () => {
    const files = listNonTestSourceFiles(GATE_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.some((f) => f.endsWith("available-interventions.ts"))).toBe(true);
    expect(files.some((f) => f.includes("__tests__"))).toBe(false);
  });

  it("sanity: this repo's own lib/gate/ source passes both checks right now (a true positive on the real codebase, not just synthetic fixtures)", () => {
    const { leakOffenders, parseOffenders } = scan();
    expect(leakOffenders).toEqual([]);
    expect(parseOffenders).toEqual([]);
  });

  describe("EXPLOIT REGRESSION (independent verification): the exact reported route, confirmed caught", () => {
    it("[reported route] Extract<Intervention, {kind:'halt'}>['mode'] assigned to a new type alias is caught, even though the literal never appears in source text", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'type HaltVariant = Extract<Intervention, { kind: "halt" }>;',
        'export type HiddenHaltMode = HaltVariant["mode"];',
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([{ line: 3, text: 'HaltVariant["mode"]' }]);
      // Confirms the reported concern is real, not hypothetical: the source text above never once spells the forbidden literal.
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });

    it("the identical computation, inline, as a function's own return type annotation (no separate alias) is also caught", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        "export function leakMode(x: Extract<Intervention, { kind: \"halt\" }>): Extract<Intervention, { kind: \"halt\" }>[\"mode\"] {",
        "  return x.mode;",
        "}",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
    });

    it("the same computation reached via a variable's own type annotation is also caught", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'declare const x: Extract<Intervention, { kind: "halt" }>;',
        'export const leaked: Extract<Intervention, { kind: "halt" }>["mode"] = x.mode;',
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("false-positive discipline: only a resolved type that REALLY contains the exact forbidden literal, never a name collision or a merely similar string", () => {
    it("does NOT flag a type alias resolving to only the checkpoint-anchored halt mode's own literal", () => {
      const source = ['export type OnlyCheckpointed = "checkpointed";'].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag a different string literal that merely contains the forbidden word as a substring of a longer word", () => {
      const source = ['export type NotIt = "enforced-policy";'].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag AvailableInterventionKind itself, or ALL_AVAILABLE_INTERVENTION_KINDS' own element type — the real, load-bearing type this milestone ships", () => {
      const source = [
        'import type { AvailableInterventionKind } from "../available-interventions.js";',
        "export type Reexported = AvailableInterventionKind;",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });
  });

  describe("fails closed on syntactically invalid input, same discipline as human-id.test.ts/architecture.test.ts", () => {
    it("a syntax error hiding a real leak is refused outright, never silently scanned as clean", () => {
      const exploit = ["function broken( {", 'export type X = "checkpointed";'].join("\n");
      expect(() => analyzeScratch(exploit)).toThrow(UnparseableFileError);
    });
  });

  /**
   * DISCLOSED LIMIT — NOT A CHECK TO PASS, A GAP PINNED SO IT IS NEVER
   * SILENTLY REDISCOVERED. See this file's own header for why this is the
   * same disclosed class `human-id.ts`'s own "route B" already names, not
   * a new, unconsidered gap.
   */
  describe("DISCLOSED LIMIT (not a check): a generic-helper cast naming the target type only at its own call site has no type-annotation position for this scan to inspect", () => {
    it("[route 2, reported alongside route 1] a generic cast through a type ARGUMENT at the call site, not a type ANNOTATION anywhere, is confirmed NOT caught", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'import type { AvailableInterventionKind } from "../available-interventions.js";',
        "function unsafeCast<T>(x: unknown): T {",
        "  return x as T;",
        "}",
        'export function leak(x: Extract<Intervention, { kind: "halt" }>): AvailableInterventionKind {',
        "  return unsafeCast<AvailableInterventionKind>(x.mode);",
        "}",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      // `leak`'s own return type annotation is `AvailableInterventionKind`
      // itself (the real, closed type — no leak there), and `x.mode` is an
      // EXPRESSION, not a type node this scan ever visits. Confirmed here,
      // not assumed.
      expect(leaks).toEqual([]);
    });
  });
});
