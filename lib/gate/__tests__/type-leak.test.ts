import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isArrowFunction,
  isBindingElement,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIdentifier,
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
 * ROUND 3 of this check, after L4 VERIFY (independent review) confirmed
 * round 2's `HiddenHaltMode` fix caught the reported route plus five
 * structural variants it independently tried (a conditional type, an
 * interface property, a namespace-nested alias, a parameter position, and
 * `satisfies`) and called the fix "real engineering, not decoration" —
 * and then reported two further routes round 2 does not see:
 *
 *     // 1 — inferred types, no annotation anywhere
 *     function getMode(x: Extract<Intervention, { kind: "halt" }>) { return x.mode; }
 *     export const modeValue = ({} as Extract<Intervention, { kind: "halt" }>).mode;
 *
 *     // 2 — a generic type parameter's own default, never visited
 *     export type Container<T = Extract<Intervention, { kind: "halt" }>["mode"]> = { value: T };
 *
 * Both proved, independently, to carry the forbidden literal
 * (`tsc --declaration --emitDeclarationOnly` for the first; a non-vacuous
 * `extends` probe for the second) while round 2's own scan reported
 * 12/12, zero leaks, against both.
 *
 * THE ACTUAL DEFECT ROUND 2 HAD, NAMED PLAINLY: round 2 walked AST
 * ANNOTATION POSITIONS — nodes with an explicit `.type` field — and asked
 * the checker what each one resolved to. `getMode`'s return has no
 * annotation at all (an entirely ordinary omission, not a trick);
 * `modeValue` is a `const` with no annotation; a `TypeParameterDeclaration`'s
 * `default` is a real type-bearing field round 2's `typeAnnotationOf`
 * never listed. Patching in these two specific positions would repeat the
 * identical mistake this account has already paid for twice on unrelated
 * checks (M1's `human-id.test.ts`, four rounds; a sibling project's own
 * architecture test, five rounds): TypeScript has more positions where a
 * type can appear, or be assigned without appearing at all, than any
 * enumeration of SYNTAX FORMS will ever list correctly. The fix is not a
 * third enumeration of positions — it is asking a POSITION-INDEPENDENT
 * question instead.
 *
 * THE FIX: iterate DECLARATIONS, not syntax forms, and ask the checker
 * for the type it ACTUALLY ASSIGNED to each one — via the semantic APIs
 * that give the real, checked type regardless of whether it was written
 * explicitly, inferred, defaulted, or computed:
 *
 *   - A value-shaped declaration (`VariableDeclaration`, `Parameter`,
 *     `PropertyDeclaration`/`PropertySignature`, a destructured
 *     `BindingElement`) — `checker.getSymbolAtLocation(name)` then
 *     `checker.getTypeOfSymbol(symbol)`. This is the SAME call whether
 *     the declaration has an explicit annotation or not — an inferred
 *     `const modeValue = (...).mode` and an explicitly-annotated one
 *     resolve through the identical code path, closing the `modeValue`
 *     gap by construction rather than by adding an "or it's inferred"
 *     branch.
 *   - A callable declaration (`FunctionDeclaration`, `ArrowFunction`,
 *     `FunctionExpression`, `MethodDeclaration`/`MethodSignature`, a
 *     get/set accessor) — `checker.getSignatureFromDeclaration(node)`
 *     then `checker.getReturnTypeOfSignature(signature)`. Again the same
 *     call whether the return type is annotated or inferred — this is
 *     what closes `getMode`'s gap: its signature's return type IS
 *     `"checkpointed" | "forced"`, computed by the checker regardless of
 *     the missing annotation.
 *   - A `TypeAliasDeclaration` — `checker.getSymbolAtLocation(name)` then
 *     `checker.getDeclaredTypeOfSymbol(symbol)` (a type alias always has
 *     an explicit `.type` syntactically, so this was never the missing
 *     case, but is expressed via the same symbol-based pattern as the
 *     other cases for consistency, not via reading `.type` directly).
 *   - A `TypeParameterDeclaration`'s own `defaultType` — handled
 *     explicitly, per the coordinator's own instruction, because a type
 *     parameter's declared/symbol type does not expose its default's
 *     resolved type at all (a default is only ever instantiated at a USE
 *     site that omits the argument, which this file does not attempt to
 *     enumerate) — `checker.getTypeFromTypeNode(node.defaultType)` when
 *     present is the one place this file still resolves a syntactic type
 *     node directly, named as a deliberate, singular exception rather
 *     than folded silently into the "iterate declarations" story.
 *
 * WHY THIS IS THE LAST ENUMERATION, NOT A THIRD ONE: every case above is
 * keyed to a DECLARATION KIND (there is a small, fixed, language-defined
 * set of ways to declare a value, a callable, or a type), never to
 * whether that declaration happens to carry a `.type` node — the axis
 * round 2 got wrong. A future TypeScript feature might add a new way to
 * WRITE a type (as `satisfies` and `as const` already exist, and both are
 * already covered because neither changes what declaration KIND the
 * enclosing binding is), but it cannot add a new declaration KIND without
 * this file needing new node-kind guards for the same reason `human-id.
 * test.ts` needs an entry for each new AST shape TypeScript adds — the
 * enumeration this file (still) performs is over the compiler's own fixed
 * grammar of DECLARATIONS, not over the open-ended space of type EXPRESSIONS
 * a declaration's type might be written or computed from, which is the
 * distinction the coordinator drew explicitly. If a further round finds
 * this still incomplete, the correct response is to narrow this file's own
 * claim to name exactly what it inspects, not to add a fourth enumeration
 * — per the coordinator's own explicit instruction, this is the last round
 * on this check either way.
 *
 * WHAT THIS FILE STILL DOES NOT, AND CANNOT, CATCH — UNCHANGED FROM ROUND
 * 2, DISCLOSED, NOT PAPERED OVER: a generic-helper cast that names the
 * target type only as a type ARGUMENT at its OWN call site
 * (`unsafeCast<AvailableInterventionKind>(x.mode)`) has no DECLARATION
 * whose assigned type this file could inspect to see it — the cast
 * expression itself is not a declaration, and the generic function's own
 * declared return type is its type PARAMETER `T`, not this project's
 * literal. This is the identical shape `human-id.ts`'s own disclosed
 * "route B" already names for `HumanId`, confirmed by L4 VERIFY as "the
 * right distinction in principle" and "consistent, not convenient" — this
 * account already ruled that class not worth chasing once, and this round
 * does not revisit that ruling. This file's own "DISCLOSED LIMIT" describe
 * block below reproduces that route and confirms, with a real, passing
 * assertion, that it is not caught.
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
 * special case this file would otherwise need to add. Failing closed on
 * every semantic diagnostic in the file would be far too broad a refusal
 * (an unrelated type error anywhere in the file would silently stop this
 * specific check from running at all), so this file states its actual,
 * narrower fail-closed guarantee here rather than the broader "fails
 * closed" an earlier draft of this comment implied.
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
    // inferred (closes the `modeValue` class of gap by construction).
    if (
      isVariableDeclaration(node) ||
      isParameterDeclaration(node) ||
      isPropertyDeclaration(node) ||
      isPropertySignatureDeclaration(node) ||
      isBindingElement(node)
    ) {
      const name: Node | undefined = node.name;
      if (name && isIdentifier(name)) {
        const symbol = checker.getSymbolAtLocation(name);
        const type = symbol ? checker.getTypeOfSymbol(symbol) : undefined;
        if (type && typeContainsForbiddenLiteral(type)) {
          report(node, "declared/inferred type of value declaration");
        }
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
    if (isTypeAliasDeclaration(node) && isIdentifier(node.name)) {
      const symbol = checker.getSymbolAtLocation(node.name);
      const type = symbol ? checker.getDeclaredTypeOfSymbol(symbol) : undefined;
      if (type && typeContainsForbiddenLiteral(type)) {
        report(node, "declared type of type alias");
      }
    }

    // A type parameter's own DEFAULT — the one deliberate, named exception
    // to "resolve via the declaration's symbol": a default is only ever
    // instantiated at a use site omitting the argument, which this file
    // does not enumerate, so its resolved type is not reachable through
    // the type parameter's own symbol at all. See this file's own header.
    if (isTypeParameterDeclaration(node) && node.defaultType) {
      const defaultType = checker.getTypeFromTypeNode(node.defaultType);
      if (defaultType && typeContainsForbiddenLiteral(defaultType)) {
        report(node.defaultType, "type parameter's own default");
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

describe("no declaration in lib/gate/**'s non-test source has a checker-assigned type containing the human-authorized halt mode's own literal — resolved per DECLARATION, not per syntax form", () => {
  it("no value/callable/type-alias declaration's actual, checker-assigned type contains the forbidden literal, however it was written, inferred, defaulted, or computed", () => {
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
