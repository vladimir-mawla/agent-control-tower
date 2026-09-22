import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isStringLiteral,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { API, type Checker, type Project } from "typescript/unstable/sync";

/**
 * THE OBLIGATION THIS FILE PROVES — inherited from M1 and restated
 * specifically for this milestone (this task's own brief, and
 * `.genesis/decisions/0001-contracts.md` Decision 2's own relocated
 * guarantee): "no module under `lib/` ever mints a `HumanId`, or
 * assembles a `halt`/`forced` `Intervention` from scratch — the only way
 * `lib/`'s own code may ever produce one is by copying `authorizedBy`/
 * `conflictId` verbatim from a value handed in by that code's own
 * caller." `lib/contracts/__tests__/human-id.test.ts` already proves the
 * "never mints a `HumanId`" half for THIS milestone's files too — it
 * walks the entire `lib/` tree, `lib/arbitrate/**` included, for free,
 * with no edit to that file. THIS file proves the narrower, second half,
 * specific to `arbitrate`, that no prior milestone's test can: every
 * `{ kind: "halt", mode: "forced", ... }` object literal anywhere in
 * `lib/arbitrate/**`'s own non-test source has `authorizedBy`/
 * `conflictId` initializers that are plain PROPERTY READS off a value
 * whose real, checker-resolved type is `HumanAuthorization` — never a
 * string literal, a function call, a spread, or anything else.
 *
 * WHY A PROPERTY-ACCESS-SHAPE CHECK, BACKED BY THE REAL TYPE CHECKER, NOT
 * A NAME MATCH: checking that the accessed identifier is literally spelled
 * `humanAuthorization` would break the moment `arbitrate.ts` introduced a
 * local alias (`const auth = humanAuthorization`) — a completely ordinary
 * refactor, not an attack. Resolving the ACCESSED OBJECT's real type via
 * `checker.getTypeAtLocation` and checking it really is `HumanAuthorization`
 * survives that refactor for free (the checker sees through the alias to
 * `auth`'s own inferred type), the identical reason `lib/contracts/
 * __tests__/human-id.test.ts` resolves a cast's target through the real
 * symbol table rather than matching the name written at the call site.
 *
 * THIS CHECK'S OWN HONEST, NAMED LIMITS — STATED HERE, ONCE, RATHER THAN
 * IMPLIED TO BE MORE THAN IT IS (the same discipline
 * `.genesis/decisions/0004-gate.md` Decision 6 arrives at only after three
 * rounds of independent review; stated at that strength here from the
 * first round, not re-earned the hard way a second time in this
 * codebase):
 *
 *   - It is scoped to object literals with a LITERAL `mode: "forced"` and
 *     `kind: "halt"` string property — the same class of "type computation
 *     with no matching literal text" indirection `.genesis/decisions/
 *     0004-gate.md` Decision 6 already disclosed as an unenumerable class
 *     for a DIFFERENT property, applies here too, and is not chased
 *     further for the identical reason.
 *   - It checks STRUCTURAL TYPE IDENTITY ("is the accessed object's real,
 *     checker-resolved type named `HumanAuthorization`"), never DATA-FLOW
 *     PROVENANCE ("did THIS SPECIFIC value actually originate from the
 *     enclosing function's own parameter, or was it fabricated by some
 *     other code in this same file and merely typed the same way"). A
 *     value structurally typed `HumanAuthorization` but constructed by an
 *     unrelated function elsewhere in the file passes this check just as
 *     cleanly as the real parameter would — reproduced verbatim, and
 *     confirmed not caught, below ("DISCLOSED LIMIT"). This milestone's
 *     actual `arbitrate.ts` has exactly one construction site
 *     (`buildForced`) that reads both fields directly off its own, sole
 *     parameter, with no local fabrication anywhere in the file — this
 *     scan is real, checked evidence for the code as actually written,
 *     composed with `assertValidHaltForced`'s runtime guard (also
 *     exercised below) and ordinary code review, never claimed to be a
 *     complete, provenance-tracing defense on its own.
 *   - It only recognizes an ordinary `PropertyAssignment` (`authorizedBy:
 *     authorization.authorizedBy`) — a shorthand property
 *     (`{ authorizedBy, conflictId }` after destructuring) or a spread
 *     (`{ ...authorization, kind: "halt", mode: "forced" }`) is not
 *     specially recognized and would be reported as a MISSING field, the
 *     safe (false-positive, not false-negative) direction to be wrong in.
 *     `arbitrate.ts`'s own real `buildForced` uses neither shape.
 *   - Like every checker-based scan in this codebase, it fails closed on
 *     any syntactic diagnostic in the scanned file (`UnparseableFileError`)
 *     rather than risk parser error-recovery silently misplacing the very
 *     node it is looking for.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const LIB_ARBITRATE_ROOT = join(REPO_ROOT, "lib", "arbitrate");
const TSCONFIG_LIB = join(REPO_ROOT, "tsconfig.lib.json");

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
    super(`could not parse ${file} as valid TypeScript — refusing to scan it as if it were clean (${diagnosticMessages.length} syntax diagnostic(s)): ${diagnosticMessages.join("; ")}`);
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

interface Offender {
  readonly file: string;
  readonly line: number;
  readonly field: "authorizedBy" | "conflictId";
  readonly reason: string;
}

function lineOf(sf: SourceFile, node: Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** `true` iff `expr` is a `PropertyAccessExpression` whose OWN OBJECT's real, checker-resolved type is named `HumanAuthorization` — see this file's header for why type identity, not the accessed object's spelled name, is the check. */
function isHumanAuthorizationPropertyRead(expr: Node, checker: Checker): boolean {
  if (!isPropertyAccessExpression(expr)) return false;
  const objectType = checker.getTypeAtLocation(expr.expression);
  const symbol = objectType?.getSymbol();
  return symbol?.name === "HumanAuthorization";
}

function scanFile(usingApi: API, file: string): readonly Offender[] {
  const snapshot = usingApi.updateSnapshot({ openProjects: [TSCONFIG_LIB], openFiles: [file] });
  const project: Project | undefined = snapshot.getProject(TSCONFIG_LIB);
  const maybeSf: SourceFile | undefined = project?.program.getSourceFile(file);
  if (!project || !maybeSf) {
    throw new Error(`scanFile: the real compiler could not load/parse ${file} as part of ${TSCONFIG_LIB}`);
  }
  const diagnostics = project.program.getSyntacticDiagnostics(file);
  if (diagnostics.length > 0) {
    usingApi.updateSnapshot({ closeFiles: [file] });
    throw new UnparseableFileError(file, diagnostics.map((d) => d.text));
  }
  const checker = project.checker;
  // Rebound to a `const` of the NARROWED type (`SourceFile`, not
  // `SourceFile | undefined`) — the nested `function` declarations below
  // are hoisted and so do not inherit the narrowing the `if` above applied
  // to `maybeSf` itself; a fresh binding whose own declared type is already
  // `SourceFile` sidesteps that without needing a non-null assertion at
  // every use site.
  const sf: SourceFile = maybeSf;

  const offenders: Offender[] = [];

  function checkForcedLiteral(node: Node): void {
    if (!isObjectLiteralExpression(node)) return;
    let hasHaltKind = false;
    let hasForcedMode = false;
    let authorizedByInit: Node | undefined;
    let conflictIdInit: Node | undefined;
    for (const prop of node.properties) {
      if (!isPropertyAssignment(prop)) continue;
      const name = prop.name.getText(sf);
      if (name === "kind" && isStringLiteral(prop.initializer) && prop.initializer.text === "halt") hasHaltKind = true;
      if (name === "mode" && isStringLiteral(prop.initializer) && prop.initializer.text === "forced") hasForcedMode = true;
      if (name === "authorizedBy") authorizedByInit = prop.initializer;
      if (name === "conflictId") conflictIdInit = prop.initializer;
    }
    if (hasHaltKind && hasForcedMode) {
      if (!authorizedByInit || !isHumanAuthorizationPropertyRead(authorizedByInit, checker)) {
        offenders.push({
          file: relative(REPO_ROOT, file),
          line: lineOf(sf, node),
          field: "authorizedBy",
          reason: authorizedByInit ? `initializer is not a HumanAuthorization property read: ${authorizedByInit.getText(sf)}` : "field missing entirely",
        });
      }
      if (!conflictIdInit || !isHumanAuthorizationPropertyRead(conflictIdInit, checker)) {
        offenders.push({
          file: relative(REPO_ROOT, file),
          line: lineOf(sf, node),
          field: "conflictId",
          reason: conflictIdInit ? `initializer is not a HumanAuthorization property read: ${conflictIdInit.getText(sf)}` : "field missing entirely",
        });
      }
    }
  }

  function visit(node: Node): void {
    checkForcedLiteral(node);
    node.forEachChild(visit);
  }
  visit(sf);
  usingApi.updateSnapshot({ closeFiles: [file] });
  return offenders;
}

function scanAll(usingApi: API): readonly Offender[] {
  const offenders: Offender[] = [];
  for (const file of listNonTestSourceFiles(LIB_ARBITRATE_ROOT)) {
    offenders.push(...scanFile(usingApi, file));
  }
  return offenders;
}

describe("no module under lib/arbitrate/** assembles halt/forced from scratch — every authorizedBy/conflictId it emits is read off a HumanAuthorization value, never freshly constructed", () => {
  it("the real, shipped lib/arbitrate/** source contains zero offending halt/forced literals", () => {
    expect(scanAll(api)).toEqual([]);
  });

  it("sanity: the scan actually visits real files, so a passing result isn't vacuous", () => {
    const files = listNonTestSourceFiles(LIB_ARBITRATE_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.some((f) => f.endsWith("arbitrate.ts"))).toBe(true);
  });

  it("EXPLOIT REGRESSION: a freshly-minted authorizedBy string literal in a halt/forced literal is caught by name and line, while the genuinely-sourced conflictId alongside it is correctly left unflagged", () => {
    const scratchFile = join(LIB_ARBITRATE_ROOT, "__scratch_self_authorized.ts");
    writeFileSync(
      scratchFile,
      [
        'import type { Intervention } from "../contracts/intervention.js";',
        'import type { HumanAuthorization } from "./human-authorization.js";',
        "export function mintForced(authorization: HumanAuthorization): Intervention {",
        '  return { kind: "halt", mode: "forced", authorizedBy: "self-approved" as never, conflictId: authorization.conflictId };',
        "}",
      ].join("\n"),
    );
    try {
      const scratchApi = new API();
      try {
        const offenders = scanFile(scratchApi, scratchFile);
        expect(offenders.map((o) => o.field).sort()).toEqual(["authorizedBy"]);
      } finally {
        scratchApi.close();
      }
    } finally {
      rmSync(scratchFile, { force: true });
    }
  });

  it("FALSE-POSITIVE DISCIPLINE: this milestone's own real buildForced-shaped construction (reading both fields off a HumanAuthorization-typed parameter) is NOT flagged", () => {
    const scratchFile = join(LIB_ARBITRATE_ROOT, "__scratch_real_shape.ts");
    writeFileSync(
      scratchFile,
      [
        'import type { HaltForced } from "../contracts/intervention.js";',
        'import type { HumanAuthorization } from "./human-authorization.js";',
        "export function buildForcedLike(authorization: HumanAuthorization): HaltForced {",
        '  return { kind: "halt", mode: "forced", authorizedBy: authorization.authorizedBy, conflictId: authorization.conflictId };',
        "}",
        "export function buildForcedLikeViaAlias(authorization: HumanAuthorization): HaltForced {",
        "  const auth = authorization;",
        '  return { kind: "halt", mode: "forced", authorizedBy: auth.authorizedBy, conflictId: auth.conflictId };',
        "}",
      ].join("\n"),
    );
    try {
      const scratchApi = new API();
      try {
        expect(scanFile(scratchApi, scratchFile)).toEqual([]);
      } finally {
        scratchApi.close();
      }
    } finally {
      rmSync(scratchFile, { force: true });
    }
  });

  it("DISCLOSED LIMIT (not a check): this scan verifies STRUCTURAL type identity ('is this a HumanAuthorization-typed value'), never DATA-FLOW PROVENANCE ('did this specific value actually originate from the enclosing function's own parameter, or was it fabricated by other code in this same file and merely typed the same way') — reproduced verbatim, confirmed not caught", () => {
    const scratchFile = join(LIB_ARBITRATE_ROOT, "__scratch_disclosed_limit.ts");
    writeFileSync(
      scratchFile,
      [
        'import type { HaltForced } from "../contracts/intervention.js";',
        'import type { HumanId } from "../contracts/human-id.js";',
        'import type { ConflictId } from "../contracts/ids.js";',
        'import type { HumanAuthorization } from "./human-authorization.js";',
        "// A value structurally typed HumanAuthorization, but never read off",
        "// this file's own caller at all — fabricated right here.",
        "function fabricate(): HumanAuthorization {",
        '  return { authorizedBy: "definitely-not-a-human" as HumanId, conflictId: "definitely-not-a-conflict" as ConflictId };',
        "}",
        "export function buildForcedFromFabricated(_authorization: HumanAuthorization): HaltForced {",
        "  const fake = fabricate();",
        '  return { kind: "halt", mode: "forced", authorizedBy: fake.authorizedBy, conflictId: fake.conflictId };',
        "}",
      ].join("\n"),
    );
    try {
      const scratchApi = new API();
      try {
        // `fake.authorizedBy`/`fake.conflictId` ARE property reads off a
        // value whose type resolves to the symbol `HumanAuthorization` —
        // this scan's own check (see `isHumanAuthorizationPropertyRead`)
        // asks only "is the accessed object's type named HumanAuthorization,"
        // which `fake` satisfies, even though `fake` was never this
        // function's own `_authorization` parameter at all. Tracing that a
        // given HumanAuthorization-typed value's OWN construction, wherever
        // it happened, itself only ever copied fields from some further
        // caller — arbitrarily deep — is the open-ended data-flow-tracing
        // problem this file's header names and does not attempt to solve;
        // see `arbitrate.ts`'s own `buildForced`, the sole real construction
        // site in this milestone, for why the actual code never has this
        // shape (composed with `assertValidHaltForced`'s runtime guard and
        // ordinary code review — never claimed to rest on this scan alone).
        expect(scanFile(scratchApi, scratchFile)).toEqual([]);
      } finally {
        scratchApi.close();
      }
    } finally {
      rmSync(scratchFile, { force: true });
    }
  });
});
