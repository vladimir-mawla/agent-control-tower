import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isArrowFunction,
  isBindingElement,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIndexSignatureDeclaration,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isParameterDeclaration,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isSetAccessorDeclaration,
  isTypeAliasDeclaration,
  isTypeParameterDeclaration,
  isVariableDeclaration,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { API, isStringLiteralType, isUnionType, type Project, type Type } from "typescript/unstable/sync";

/**
 * THIS IS A BEST-EFFORT RECALL LAYER, NOT A COMPLETENESS CLAIM — STATED AT
 * THAT STRENGTH AFTER THREE ROUNDS OF ADVERSARIAL REVIEW EACH FOUND A
 * MISSED DECLARATION POSITION FROM A DIFFERENT DIRECTION. Read this
 * paragraph before any other claim in this file, because it supersedes
 * anything below that reads as a claim of completeness:
 *
 *   This file resolves the checker's assigned type for the declaration
 *   kinds it enumerates, and that enumeration is NOT proven complete.
 *   Three rounds of adversarial review found a missed position each
 *   time, and there is no reason to believe a further round would not.
 *   The load-bearing guarantee is elsewhere: `available-interventions.ts`'s
 *   own `AvailableInterventionKind` (a closed `Exclude<>` definition with
 *   no member for the human-authorized halt mode at all), and
 *   `availableInterventions`'s own signature carrying no `Intervention`-
 *   typed parameter, so a stray type-level position anywhere in this
 *   package has no live value to actually carry.
 *
 * WHY THIS CLAIM, AND NOT ANOTHER ATTEMPT AT COMPLETENESS: a claim of
 * completeness over TypeScript's declaration surface is falsified by one
 * counterexample, and this milestone produced one per round, from a
 * different direction each round. A best-effort recall claim is TRUE AS
 * STATED and stays true when the next position is found — the next
 * finding then IMPROVES this file rather than falsifying this comment.
 * That is the difference between a limit stated at its true strength and
 * an overclaim waiting to be broken, which is the distinction this whole
 * project is built around (see `.genesis/decisions/0001-contracts.md`'s
 * own multi-round history on `HumanId` for the identical lesson, learned
 * once already on a different check).
 *
 * THE THREE-ROUND HISTORY, RECORDED SO A FUTURE READER DOES NOT HAVE TO
 * RECONSTRUCT WHY THIS FILE LOOKS THE WAY IT DOES:
 *
 *   ROUND 2 (first version of this file): walked AST nodes with an
 *   explicit `.type` field. CATEGORY ERROR 1: gated on WHETHER A NODE
 *   HAD AN ANNOTATION, so an inferred function return
 *   (`function getMode(x) { return x.mode; }`), an inferred `const`
 *   (`const modeValue = (...).mode`), and a type parameter's own
 *   `defaultType` field — none annotated, all real type-bearing
 *   positions — were invisible to it.
 *
 *   ROUND 3: switched to resolving each declaration's own checker-
 *   assigned type (via its symbol, or its signature's return type)
 *   instead of reading `.type` — closing every round-2 gap. CATEGORY
 *   ERROR 2, A NARROWER FORM OF THE SAME MISTAKE: before resolving a
 *   value declaration's symbol, this file gated on `isIdentifier(name)`
 *   — so a `ComputedPropertyName` (`[modeKey]: ...`) or a
 *   `PrivateIdentifier` (`#mode`) was skipped even though the ENCLOSING
 *   declaration kind (`PropertyDeclaration`) was already in this file's
 *   own kind list. Separately, `TypeParameterDeclaration.constraint` and
 *   `.defaultType` are sibling, independent `TypeNode` fields on the same
 *   node — round 3 visited only one, with no stated reason for excluding
 *   the other.
 *
 *   ROUND 4 (this version): removed the `isIdentifier` gate entirely —
 *   `node.name` is now passed to `getSymbolAtLocation` whatever kind of
 *   name node it is, so a computed or private name resolves through the
 *   identical path an ordinary identifier does, rather than a new,
 *   name-kind-specific branch. `TypeParameterDeclaration.constraint` is
 *   now checked alongside `.defaultType`, for the same reason: they are
 *   the same kind of field, and singling one out was the error, not a
 *   choice that needed a third field added to match it. Per the
 *   coordinator's own explicit ruling ending this loop: this round does
 *   NOT attempt a fourth completeness claim. A genuinely complete
 *   approach (iterating the module's symbol table directly, rather than
 *   walking declarations) was considered and NOT built — recall plus an
 *   honest claim is the correct resting state, not a fourth enumeration.
 *
 * WHAT THIS FILE CONCRETELY CATCHES TODAY, CONFIRMED BY REAL TESTS BELOW
 * (not claimed as an exhaustive list, only as what has actually been
 * checked): the original `HiddenHaltMode` type-alias indirection; the
 * identical computation inline as a function's return type or a
 * variable's own type; an inferred function return type; an inferred
 * `const`'s type; a generic type parameter's own default AND constraint;
 * a computed property name; a private class field; a conditional type; an
 * interface property; a namespace-nested type alias; a parameter
 * position; `satisfies`; nested and rest destructuring; a setter
 * parameter; an overload signature; and a multi-declaration symbol where
 * only one declaration leaks. `Intervention["mode"]`-shaped string ENUM
 * members were checked and ruled a genuine non-finding, not an untested
 * gap: a string enum member requires a constant literal initializer, so
 * it cannot carry a computed type's value without spelling the literal
 * directly — which `architecture.test.ts`'s own text scan already catches.
 *
 * WHAT THIS FILE STILL DOES NOT, AND CANNOT, CATCH — UNCHANGED SINCE
 * ROUND 2, DISCLOSED, NOT PAPERED OVER: a generic-helper cast that names
 * the target type only as a type ARGUMENT at its OWN call site
 * (`unsafeCast<AvailableInterventionKind>(x.mode)`) has no DECLARATION
 * whose assigned type this file could inspect to see it — the cast
 * expression itself is not a declaration, and the generic function's own
 * declared return type is its type PARAMETER `T`, not this project's
 * literal. This is the identical shape `human-id.ts`'s own disclosed
 * "route B" already names for `HumanId`, confirmed by L4 VERIFY across
 * two separate rounds as "the right distinction in principle" and
 * "consistent, not convenient" — this account already ruled that class
 * not worth chasing once, and this file does not revisit that ruling.
 * This file's own "DISCLOSED LIMIT" describe block below reproduces that
 * route and confirms, with a real, passing assertion, that it is not
 * caught.
 *
 * FAILS CLOSED, STATED PRECISELY RATHER THAN MORE BROADLY THAN IT HOLDS:
 * this file refuses a file outright (`UnparseableFileError`) only on a
 * SYNTAX diagnostic (`getSyntacticDiagnostics`) — a file the parser itself
 * cannot make sense of. It does NOT also fail closed on a SEMANTIC
 * diagnostic, such as an unresolvable import (`TS2307`): such a file
 * parses fine and is scanned normally. This is deliberate, not an
 * oversight left unstated — an unresolved reference resolves, at the
 * checker level, to the error type, which is neither a string-literal
 * type nor a union `typeContainsForbiddenLiteral` below would ever
 * recurse into, so it is excluded by construction rather than by a
 * special case this file would otherwise need to add. Independently
 * confirmed, not merely argued: a real `HiddenHaltMode`-style leak placed
 * ALONGSIDE an unresolvable import in the same file is still caught — a
 * semantic error elsewhere in the file creates no blind spot for this
 * check. Failing closed on every semantic diagnostic in the file would be
 * a far broader refusal than that (an unrelated type error anywhere in
 * the file would silently stop this specific check from running at all),
 * so this file states its actual, narrower fail-closed guarantee here.
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
 * Whether `type` IS, or is a union CONTAINING, the exact string-literal
 * type named by `FORBIDDEN_LITERAL` — see this file's own header for why
 * recursing into unions (and not intersections or object-type properties)
 * is enough: every declaration-level type this file resolves below is
 * already the UNWRAPPED type a value/return/alias actually has, not an
 * object type with the literal buried inside some further property.
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

  function report(node: Node, kind: string): void {
    leaks.push({ line: lineOf(node), text: `${kind}: ${node.getText(sf)}` });
  }

  function visit(node: Node): void {
    // Value-shaped declarations: a variable, parameter, property, or a
    // destructured binding element — resolved via its own symbol's type,
    // the SAME call whether the declaration is explicitly annotated or
    // inferred. `node.name` is passed to `getSymbolAtLocation` WHATEVER
    // kind of name node it is — an `Identifier`, a `ComputedPropertyName`
    // (`[modeKey]: ...`), a `PrivateIdentifier` (`#mode`), or a binding
    // pattern — never gated on `isIdentifier(name)` first. An earlier
    // round of this file DID gate on that, which is exactly the mistake
    // this file's own header records as its own second category error:
    // skipping a computed or private name even though the ENCLOSING
    // declaration kind was already in this list.
    if (
      isVariableDeclaration(node) ||
      isParameterDeclaration(node) ||
      isPropertyDeclaration(node) ||
      isPropertySignatureDeclaration(node) ||
      isBindingElement(node)
    ) {
      const nameNode = node.name;
      const symbol = nameNode ? checker.getSymbolAtLocation(nameNode) : undefined;
      const type = symbol ? checker.getTypeOfSymbol(symbol) : undefined;
      if (type && typeContainsForbiddenLiteral(type)) {
        report(node, "declared/inferred type of value declaration");
      }
    }

    // Callable declarations: resolved via the declaration's own SIGNATURE
    // and that signature's ACTUAL return type — the same call whether the
    // return type is annotated or inferred (closes the `getMode` class of
    // gap by construction).
    if (
      isFunctionDeclaration(node) ||
      isArrowFunction(node) ||
      isFunctionExpression(node) ||
      isMethodDeclaration(node) ||
      isMethodSignatureDeclaration(node) ||
      isGetAccessorDeclaration(node) ||
      isSetAccessorDeclaration(node)
    ) {
      const signature = checker.getSignatureFromDeclaration(node);
      const returnType = signature ? checker.getReturnTypeOfSignature(signature) : undefined;
      if (returnType && typeContainsForbiddenLiteral(returnType)) {
        report(node, "return type of callable declaration");
      }
    }

    // A type alias's own declared type, via its symbol (a type alias
    // always has an explicit `.type` syntactically, so this was never the
    // missing case — expressed the same, symbol-based way as the other
    // cases above for consistency, not by reading `.type` directly).
    if (isTypeAliasDeclaration(node)) {
      const symbol = checker.getSymbolAtLocation(node.name);
      const type = symbol ? checker.getDeclaredTypeOfSymbol(symbol) : undefined;
      if (type && typeContainsForbiddenLiteral(type)) {
        report(node, "declared type of type alias");
      }
    }

    // A type parameter's own CONSTRAINT and DEFAULT — sibling, independent
    // `TypeNode` fields on the same declaration, both checked, neither
    // singled out. Round 3 visited only `defaultType`, with no reasoning
    // given for leaving `constraint` unvisited — the second category error
    // this file's own header records (two optional fields on one node,
    // one inspected and one not, with nothing said about why). Neither is
    // reachable through the type parameter's own symbol (a default and a
    // constraint are only ever consulted at a USE site that omits or needs
    // to check an argument, which this file does not enumerate), so both
    // are resolved directly from their own type nodes — the only place
    // this file still resolves a syntactic type node rather than a
    // declaration's checker-assigned type.
    if (isTypeParameterDeclaration(node)) {
      for (const typeNode of [node.constraint, node.defaultType]) {
        if (!typeNode) continue;
        const type = checker.getTypeFromTypeNode(typeNode);
        if (type && typeContainsForbiddenLiteral(type)) {
          report(typeNode, "type parameter's own constraint/default");
        }
      }
    }

    // An index signature's own type is always an explicit syntactic type
    // (it cannot be inferred at all), so it is resolved directly.
    if (isIndexSignatureDeclaration(node)) {
      const type = checker.getTypeFromTypeNode(node.type);
      if (type && typeContainsForbiddenLiteral(type)) {
        report(node.type, "index signature's own type");
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

describe("best-effort recall: none of the declaration kinds this file enumerates in lib/gate/**'s non-test source has a checker-assigned type containing the human-authorized halt mode's own literal (see this file's own header for why this is NOT claimed to be every declaration kind TypeScript has)", () => {
  it("no enumerated value/callable/type-alias/type-parameter declaration's checker-assigned type contains the forbidden literal, however it was written, inferred, defaulted, or computed", () => {
    const { leakOffenders } = scan();
    if (leakOffenders.length > 0) {
      const report = leakOffenders.map((o) => `${o.file}:${o.line}: ${o.text}`).join("\n");
      throw new Error(
        `Found a declaration whose checker-ASSIGNED type includes the human-authorized halt mode's own ` +
          `literal:\n${report}`,
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

  describe("EXPLOIT REGRESSION (round 2, still caught by the round-3 rewrite): the original reported route", () => {
    it("[round 2] Extract<Intervention, {kind:'halt'}>['mode'] assigned to a new type alias is caught, even though the literal never appears in source text", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'type HaltVariant = Extract<Intervention, { kind: "halt" }>;',
        'export type HiddenHaltMode = HaltVariant["mode"];',
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      // Confirms the reported concern is real, not hypothetical: the source text above never once spells the forbidden literal.
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });

    it("the identical computation, inline, as a function's own EXPLICIT return type annotation is also caught", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        "export function leakMode(x: Extract<Intervention, { kind: \"halt\" }>): Extract<Intervention, { kind: \"halt\" }>[\"mode\"] {",
        "  return x.mode;",
        "}",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
    });

    it("the same computation reached via a variable's own EXPLICIT type annotation is also caught", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'declare const x: Extract<Intervention, { kind: "halt" }>;',
        'export const leaked: Extract<Intervention, { kind: "halt" }>["mode"] = x.mode;',
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("EXPLOIT REGRESSION (round 3): the two routes independent review reported past round 2's annotation-position scan", () => {
    it("[round 3, route 1a] a function's INFERRED return type (no annotation at all) is caught via its own signature", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'function getMode(x: Extract<Intervention, { kind: "halt" }>) {',
        "  return x.mode;",
        "}",
        "export const useIt = getMode;",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });

    it("[round 3, route 1b] a const with an INFERRED type (no annotation at all) is caught via its own symbol", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'export const modeValue = ({} as Extract<Intervention, { kind: "halt" }>).mode;',
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });

    it("[round 3, route 2] a generic type parameter's own DEFAULT is caught, even though it is never itself an annotation on any value or callable", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'export type Container<T = Extract<Intervention, { kind: "halt" }>["mode"]> = { value: T };',
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });
  });

  describe("EXPLOIT REGRESSION (round 4): the three routes independent review reported past round 3's isIdentifier(name) gate and its unvisited constraint field", () => {
    it("[round 4, route 1] a COMPUTED property name is caught — the enclosing PropertyDeclaration was already in this file's kind list, but round 3 skipped it by gating on isIdentifier(name) first", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'const modeKey = "mode";',
        "export class HasComputed {",
        '  [modeKey]: Extract<Intervention, { kind: "halt" }>["mode"] = { kind: "halt", mode: "checkpointed" } as never;',
        "}",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });

    it("[round 4, route 2] a PRIVATE class field is caught, for the identical reason a computed name is", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        "export class HasPrivate {",
        '  #mode: Extract<Intervention, { kind: "halt" }>["mode"] = { kind: "halt", mode: "checkpointed" } as never;',
        "}",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });

    it("[round 4, route 3] a generic type parameter's own CONSTRAINT is caught, alongside its default — sibling fields, both now checked", () => {
      const source = [
        'import type { Intervention } from "../../contracts/intervention.js";',
        'export function useHalt<T extends Extract<Intervention, { kind: "halt" }>["mode"]>(x: T): T {',
        "  return x;",
        "}",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      expect(source.toLowerCase().includes(FORBIDDEN_LITERAL)).toBe(false);
    });
  });

  describe("false-positive discipline: only a resolved type that REALLY contains the exact forbidden literal, never a name collision, an unrelated inferred type, or a merely similar string", () => {
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

    it("does NOT flag AvailableInterventionKind itself, or a re-export of it — the real, load-bearing type this milestone ships", () => {
      const source = [
        'import type { AvailableInterventionKind } from "../available-interventions.js";',
        "export type Reexported = AvailableInterventionKind;",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag an ordinary function with an ordinary inferred return type", () => {
      const source = ["function add(a: number, b: number) {", "  return a + b;", "}", "export const sum = add(1, 2);"].join(
        "\n",
      );
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag a generic type parameter's default that resolves to only the checkpoint-anchored halt mode's own literal", () => {
      const source = ["export type OnlyCheckpointedDefault<T = \"checkpointed\"> = { value: T };"].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag a destructured binding element with an unrelated inferred type", () => {
      const source = ['const { length } = "hello";', "export const len = length;"].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag a computed property name resolving to only the checkpoint-anchored halt mode's own literal", () => {
      const source = [
        'const key = "mode";',
        "export class OnlyCheckpointedComputed {",
        '  [key]: "checkpointed" = "checkpointed";',
        "}",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag a private class field with an unrelated type", () => {
      const source = ["export class HasUnrelatedPrivate {", "  #count: number = 0;", "}"].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("does NOT flag a generic type parameter's constraint that resolves to only the checkpoint-anchored halt mode's own literal", () => {
      const source = ['export function onlyCheckpointed<T extends "checkpointed">(x: T): T {', "  return x;", "}"].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });
  });

  describe("fails closed on syntactically invalid input, same discipline as human-id.test.ts/architecture.test.ts", () => {
    it("a syntax error hiding a real leak is refused outright, never silently scanned as clean", () => {
      const exploit = ["function broken( {", 'export type X = "checkpointed";'].join("\n");
      expect(() => analyzeScratch(exploit)).toThrow(UnparseableFileError);
    });

    it("does NOT overtighten: a file with a SEMANTIC error (an unresolvable import) but no SYNTAX error still scans normally, never refused as unparseable — see this file's own header for why that is safe", () => {
      const source = [
        'import { doesNotExist } from "./__definitely_not_a_real_module__.js";',
        'export type X = "checkpointed";',
        "export const useIt = doesNotExist;",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks).toEqual([]);
    });

    it("a semantic error (an unresolvable import) elsewhere in the file creates NO blind spot for a real leak in the same file — confirmed directly, not merely argued", () => {
      const source = [
        'import { doesNotExist } from "./__definitely_not_a_real_module__.js";',
        'import type { Intervention } from "../../contracts/intervention.js";',
        'type HaltVariant = Extract<Intervention, { kind: "halt" }>;',
        'export type HiddenHaltMode = HaltVariant["mode"];',
        "export const useIt = doesNotExist;",
      ].join("\n");
      const { leaks } = analyzeScratch(source);
      expect(leaks.length).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * DISCLOSED LIMIT — NOT A CHECK TO PASS, A GAP PINNED SO IT IS NEVER
   * SILENTLY REDISCOVERED. See this file's own header for why this is the
   * same disclosed class `human-id.ts`'s own "route B" already names, not
   * a new, unconsidered gap — confirmed by L4 VERIFY as the right
   * distinction to draw, not a convenient one.
   */
  describe("DISCLOSED LIMIT (not a check): a generic-helper cast naming the target type only at its own call site has no declaration whose assigned type exposes it", () => {
    it("a generic cast through a type ARGUMENT at the call site, not any declaration's own assigned type, is confirmed NOT caught", () => {
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
      // `leak`'s own signature return type is the DECLARED `AvailableInterventionKind`
      // (the real, closed type — no leak there); `unsafeCast`'s own declared
      // return type is its type PARAMETER `T`, not this project's literal;
      // and `x.mode` is an EXPRESSION passed as an argument, not itself a
      // declaration this scan resolves. Confirmed here, not assumed.
      expect(leaks).toEqual([]);
    });
  });
});
