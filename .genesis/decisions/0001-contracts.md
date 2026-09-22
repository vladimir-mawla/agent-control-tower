# ADR 0001 — M1 contracts: alternatives considered, and the two gaps the plan leaves for M3/M4/M5 to close

- **Date:** 2026-09-22 (Decision 2 revised same day, after L4 VERIFY rejected this milestone's first PR
  having found and run two working bypasses — see Decision 2 for the full incident report)
- **Status:** accepted
- **Phase / milestone:** M1 (BUILD) — `lib/contracts/`

## Context

`.genesis/PLAN.md` §2 names six types M1 must fix exactly once, frozen after this milestone:
`Corroboration`, `ResourceClaim`, `CheckpointDeclaration`, `Conflict`, `Intervention`,
`ConflictSeverity`. The plan's own "riskiest design decision" (§4, M1; report) is that `halt`/`forced`
must be structurally uncompilable without a per-conflict human authorization token — a type-level
impossibility, not a runtime policy check. This ADR records the shape chosen for each type, the
alternatives rejected, and — per this account's own standing discipline against silently resolving an
ambiguous plan — two places where the plan's prose and the plan's own later-milestone signatures pull
in different directions, and how this milestone chose to leave them open rather than guess.

## Decision 1 — `Intervention`: the union as specified, plus a runtime guard the type system alone cannot provide

`Intervention` is implemented exactly as plan §2's code block: five top-level kinds
(`observe`/`warn`/`pause`/`halt`/`quarantine`), `halt` carrying a closed `"checkpointed" | "forced"`
mode. `halt`/`forced` requires `authorizedBy: HumanId` and `conflictId: ConflictId`; `quarantine`
requires `NonEmptyArray<ResourceClaimId>` (a tuple type, `readonly [T, ...T[]]`, not `ResourceClaimId[]`
plus a length check — `[]` is not assignable to it, which is what makes it a type failure, not a runtime
one). `lib/contracts/__tests__/intervention.test.ts` proves every field-omission case named in the
plan's own "what it refuses" bullet with `@ts-expect-error`, and proves `assertNeverIntervention` is a
live exhaustiveness guard (not decorative) by demonstrating, on a local stand-in type, that removing a
handled case makes the `never`-typed default branch fail to compile with `TS2345` — verified for real
during implementation (the case was actually deleted, `npm run typecheck` was actually run and actually
failed on that exact line, then the case was restored and typecheck passed again; see the milestone's PR
report for the transcript).

**Alternative considered and rejected: reusing decision-engine's `Decision` shape (`outcome` +
per-outcome `missing` field) for `Intervention`.** The plan's own report already rejects this at the
design level ("Control Tower decides what to do about someone else's already-running action, which is a
different question with no natural mapping onto that enum"); this ADR's only addition is confirming, by
actually writing the types, that the mapping really doesn't work mechanically either — `Decision`'s
`missing: MissingFact | MissingTime | MissingJudgment` names what's missing to justify NOT acting yet;
`Intervention` names what action to actually take against a different party's running process. There is
no field-for-field correspondence to reuse, only the surface-level "discriminated union with per-variant
required fields" pattern, which this project re-derives independently rather than importing.

## Decision 2 — the "no engine may construct `halt`/`forced` on its own initiative" refusal: two independently-verified bypasses, what was fixed, and the claim finally stated at its true strength

**This decision was revised after L4 VERIFY (independent review) rejected the PR this milestone first
opened, having found and run two working bypasses.** The original version of this decision described a
single mechanism (no minting function + a text-grep test) and claimed more than that mechanism actually
held. Both the mechanism and the claim are corrected below; nothing about this revision is hidden —
`__tests__/human-id.test.ts` and `__tests__/intervention.test.ts` both now contain tests that reproduce
the exact reported bypasses and pin what happens, one way or the other, for each.

**Bypass 1 — casting the whole object through `unknown`, never naming `HumanId` at all:**

```ts
export const attack1: HaltForced = {
  kind: "halt", mode: "forced",
  authorizedBy: "not-a-real-human", conflictId: "fake-conflict",
} as unknown as HaltForced;
```

`typecheck` clean, `assertValidHaltForced(attack1)` returned `{ ok: true }` (it only checked that both
fields were present, non-empty strings — which fabricated ones still are). **This is not a bug in
`assertValidHaltForced`, and no fix was applied to it that adds a check here** — see the "what was
NOT changed, and why" paragraph below. The fix was to the CLAIM: `intervention.ts`'s own header and
`assertValidHaltForced`'s doc comment were rewritten to state, at their true strength, that the type
system and this file's checks make an unauthorized `halt`/`forced` impossible to construct
*accidentally* or *conveniently* — never that they make it impossible to construct at all by a
deliberate, visible cast written in cleartext inside `lib/`. `__tests__/intervention.test.ts` now
contains a test ("DISCLOSED LIMIT: a fully-formed cast...") that reproduces `attack1` verbatim and
asserts `assertValidHaltForced` returns `{ ok: true }` for it — a passing, documented test pinning the
gap, not a silently rediscoverable one.

**Bypass 2 — aliasing the import so the cast site never spells `HumanId`:**

```ts
import type { HumanId as HID } from "./human-id.js";
export function mintFakeHuman(raw: string): HID { return raw as HID; }
```

This reconstructs, in one line, exactly the convenience constructor this decision already rejected
below (see "Alternative considered and rejected") — undetected, because `__tests__/human-id.test.ts`'s
first version scanned for the literal TEXT `` `as HumanId` ``, and the cast site here never spells those
four characters. **This bypass WAS closed, with a mechanism change, not a claim narrowing**: the guard
was rebuilt on the real TypeScript type checker (`typescript@7.0.2`'s `typescript/unstable/sync`
`API`/`Project`/`Checker`, the same package this repo already depends on for `npm run typecheck`, since
its main entry is the native Go compiler and exports none of the classic `ts.createSourceFile`/
`ts.createProgram` surface at all) rather than on text. For every `as`/`<T>` cast in every non-test file
under `lib/`, the new scan resolves the cast's target type-name node to its LOCAL symbol
(`checker.getSymbolAtLocation`), follows that symbol's own alias chain
(`checker.getAliasedSymbol`, looped, capped at 20 hops) to whatever it ultimately refers to, and compares
that ORIGINAL symbol's identity — never the name written at the call site — against `HumanId`'s own real
declaration in `human-id.ts`. This closes the reported bypass regardless of the local alias name, and
was additionally hardened, before any verifier tried it, against a parenthesized cast target
(`as (HumanId)`, not itself a `TypeReferenceNode`) and a multi-hop re-export chain (`export type {
HumanId as X } from ...` re-imported and aliased again) — both confirmed caught by dedicated tests, not
assumed to generalize from the one reported case.

**This account's own precedent for exactly this class of fix, read and followed, not reinvented:**
`shadow-run`'s `lib/simulate/__tests__/architecture.test.ts` hit the identical wall — a hand-rolled/
text-based scanner has open-ended gaps — for a different property (LLM/network imports, not a
branded-type cast) and, after five rounds of patching a tokenizer, replaced it outright with the real
compiler. This project's fix reuses that same scaffolding (one `API` instance per test file, `Node#
forEachChild` AST walking, failing closed via `getSyntacticDiagnostics` before trusting any walk — a
syntax error can make the parser's own error recovery silently misplace the very node being searched
for) and adds, on top of it, the one piece shadow-run's own test never needed: resolving a SYMBOL through
the checker, because catching an aliased cast is a semantic fact no syntax tree alone carries.

**A real, second-order problem found and fixed while building this, worth recording:** the checker-based
scan's first working version called `snapshot.getDefaultProjectForFile(file)` and, for any `lib/`
file that doesn't itself import `human-id.ts`, got back either the wrong project (this repo has two
tsconfigs at its root — `tsconfig.json`, which `exclude`s `lib/**/*`, and `tsconfig.lib.json`, which
actually covers it) or a single-file INFERRED project that could never resolve `human-id.ts`'s
declaration at all — `Snapshot.getProjects()` never even listed `tsconfig.lib.json` as a known project,
confirmed directly, not assumed. Fixed by opening `tsconfig.lib.json` explicitly (`openProjects`) and
fetching it by name (`Snapshot.getProject`) instead of asking the API to guess. A second, separate
instance of the same class of problem then appeared for the SCRATCH files the exploit-regression tests
write to disk at runtime: once a project has been opened once through a given `API` instance, re-opening
it (even after `closeProjects` and `clearSourceFileCache()`) does not re-run the config's include glob,
so a file that didn't exist yet the first time stayed invisible for the rest of that instance's life —
confirmed directly by writing a probe file and checking `project.rootFiles.length` before and after.
Fixed by giving every scratch-file analysis its OWN fresh, one-off `API` instance (the file already
exists on disk before that instance is even constructed, so its first-ever project open — proven to work
correctly — is the only open it ever needs).

**Alternative considered and rejected (unchanged from the original decision, now confirmed correct by
the incident above rather than merely argued): give `HumanId` a minting function identical in shape to
the other five id brands', and rely on the required-field check alone.** Bypass 2 is a direct
demonstration of why this remains rejected: it is exactly what a `humanId(raw: string): HumanId`
convenience constructor would let a caller do trivially, in one line, without even needing a cast at
all.

**Chosen, final shape:** `human-id.ts` exports the `HumanId` brand with **no minting function anywhere in
`lib/`**, enforced by a checker-based, symbol-identity scan (not a grep) with no excluded "defining file"
the way `Confidence`/`CostOfBeingWrong` exclude `confidence.ts`/`cost.ts` — no file in this codebase is
meant to have that exemption. `assertValidHaltForced` additionally rejects a cast that drops or blanks
either field entirely.

**What was NOT changed, and why — the claim stated at its true strength, not narrowed by omission:**
`assertValidHaltForced` was deliberately NOT strengthened to try to catch Bypass 1 (e.g. by requiring a
hash of `authorizedBy`+`conflictId` computed by some `computeAuthorizationTag` function). Considered and
rejected: any check computable from data this function already holds is a check an attacker who already
has `as unknown as X` access to `lib/contracts` source could compute identically for their own fabricated
fields — such a check would be theater, adding a line of code without adding any actual defense, which is
worse than the honestly-stated gap it would paper over. Verifying either fact for real (that
`authorizedBy` names a consenting human, that `conflictId` genuinely matches) requires either a secret
this pure, I/O-free `lib/contracts` module should not hold, or an external record to check against —
`HumanAuthorization`-style matching, which is `arbitrate`'s (M5, unbuilt) job if it is ever built against
real infrastructure this milestone does not have, not a fix to backfill into M1's frozen types now. This
is the same "no TypeScript design can stop a deliberate cast" property the type system as a whole already
accepts as an honest, disclosed limit (decision-engine's own honest-limits section: a brand "stops an
accidental assignment, not a deliberate cast") — restated here, once, at exactly its true strength, per
this account's own standing note against restating a disclosed limit more strongly than it holds. The
claim this milestone actually makes, everywhere it is stated (`intervention.ts`'s header,
`assertValidHaltForced`'s doc comment, this ADR): the type system makes an unauthorized `halt`/`forced`
impossible to construct *accidentally* or *conveniently*; reaching one requires writing a deliberate,
visible unsafe cast in `lib/` source — a reviewable act that looks exactly like what it is, not something
a policy check catches later.

**Real falsifiability incidents recorded for both fixes, not just described:** for Bypass 2's fix, the
new checker-based scan's own `resolveToOriginalSymbol` alias-following step was temporarily reverted to
compare the LOCAL symbol directly (no alias-following) — this broke not only the reported-bypass
regression test but every cross-file cast test, including the plain, un-aliased case (`"alice" as
HumanId` from a different file resolves to a locally-scoped import-alias symbol with a DIFFERENT id than
`HumanId`'s own declaration, even when the local name matches) — 6 tests failed with clear, specific
mismatches, none silently passing; restoring the alias-following step returned the suite to green. This
also confirms alias-following is not an edge-case add-on but the mechanism the entire cross-file check
depends on. Separately, the first version of `human-id.ts`'s own header comment used the literal phrase
`` `as HumanId` `` three times while documenting the (then text-based) scan, and the scan matched its own
governing file's prose and failed `npm test` on the very first run — correct behavior, not a bug, fixed
by rewording the comments; the rebuilt checker-based scan closes this class of false positive
structurally (comments are not part of the AST at all, confirmed by a dedicated test), rather than
merely by careful wording a second time.

## Decision 3 — `Conflict` and `ResourceClaim.id`: two shapes the plan does not fully specify, deliberately left open rather than guessed

Two places in the plan pull in different directions, and this milestone chose not to silently resolve
either one in favor of an invented shape:

1. **`Conflict`.** Plan §2 defines it exactly as "closed 3-value enum: `write-write | write-read |
   undeclared-access`" — the same shape as `Corroboration`/`ConflictSeverity`. But `.genesis/DONE.html`'s
   locked spec requires a ruling to "always cite the conflict id," and `Intervention`'s `halt`/`forced`
   variant carries a `conflictId: ConflictId` that has to bind to *some* actual conflict value. A bare
   3-value string enum has no field to hold an id at all.
2. **`ResourceClaim.id`.** Plan §2's literal shape is exactly `{ agentId, resourceId, mode, declaredAt,
   ttl, corroboration }` — six fields, no `id`. But `Intervention`'s `quarantine` variant names
   `NonEmptyArray<ResourceClaimId>`, which presumes claims are identifiable individually by that point.

**Alternative considered and rejected for both: add the missing `id` field now, matching what the
downstream usage implies.** Tempting, and probably even correct — but M1 has no `detectConflicts` or
real claim-tracking code yet to test the guess against. Getting `Conflict`'s eventual richer shape wrong
(which fields it needs beyond an id — a resource, the agents, a detection timestamp — none of which the
plan's M1 section names) would freeze a wrong shape into `lib/contracts` for eight later milestones to
inherit, worse than an honest gap. This is the same account-wide lesson `speculative-flexibility-costs-
rounds.md` already states in a different shape: tolerating a case (here, a field) nobody has asked for
yet tends to produce exactly the kind of drift a later, narrower fix has to undo.

**Chosen:** leave `Conflict` and `ResourceClaim` exactly as the plan's own literal text states them —
`Conflict` a bare 3-value enum (`conflict.ts`), `ResourceClaim` the exact six named fields
(`resource-claim.ts`) — and let `ConflictId`/`ResourceClaimId` (`ids.ts`) exist as opaque tokens with no
field of `Conflict` or `ResourceClaim` required to carry them yet. How a real `Conflict` value
(M3, `lib/conflict/**`) or a tracked `ResourceClaim` (M4/M5) actually acquires an id — minted at
detection/declaration time and carried alongside, or derived some other way — is left to whichever
milestone first needs to look one up by id, when it can verify the answer against real
`detectConflicts`/`arbitrate` code rather than a guess made before either exists.

**Consequence, stated plainly for whoever builds M3:** `lib/conflict/**`'s `detectConflicts` cannot
simply return `Conflict[]` (the bare enum) and call the plan's own success criteria met — it will need
*some* richer value to satisfy `.genesis/DONE.html`'s "always cite the conflict id" requirement and
`Intervention.halt.forced.conflictId`'s type. Whether that richer type is a new, M3-owned wrapper
(e.g. `DetectedConflict { id: ConflictId; kind: Conflict; ... }`) or a revisit of this frozen file is a
call for M3 to make and document in its own ADR, not this one — flagged here so it is inherited
deliberately, not rediscovered as a surprise.

## Decision 4 — `Timestamp`, deliberately NOT modeled on memory-ledger's `CapturedAt`

`ResourceClaim.declaredAt` and `CheckpointDeclaration.declaredAt` both need some instant type.
memory-ledger's `CapturedAt` (read directly while researching this decision) rejects a future-dated
value at construction, specifically so its own `ageOf` never has to represent a negative elapsed
duration. That rule is wrong for this project: plan §5's failure-suite case 7 is "a heartbeat timestamped
after `now` ... must fail closed to 'most stale,' never 'most fresh'" — which requires a future-dated
instant to be constructible at all, so M3's (unbuilt) detection logic has a real value to fail closed on.
Copying `CapturedAt`'s construction-time rejection would make that fixture impossible to build.

**Chosen:** `timestamp.ts` — an opaque brand with a mint function (`timestamp(raw): Timestamp`) and *no*
format or future-dated validation at all, matching `MemoryId`'s "opaque token, no invariant beyond being
a string" precedent rather than `CapturedAt`'s validating one. Clock-skew handling stays exactly where
the plan puts it: M3's job, not M1's.

## Decision 5 — `ResourceClaim.ttl` stays a plain `number`, not a branded duration

No numeric invariant for `ttl` (a minimum, a required relationship to `declaredAt`) is stated anywhere in
the plan's M1 section. Branding it now would mean inventing a rule this milestone has no way to validate
is the right one — the same reasoning Decision 3 applies to `Conflict`/`ResourceClaim.id`, one field
over. Left as `number` (milliseconds, documented in the field's own comment); whatever staleness
arithmetic M4's `availableInterventions` actually needs from it is that milestone's decision.

## Decision 6 — `Corroboration`/`Conflict`/`ConflictSeverity` get no `assertNever*` helper; `Intervention` does

Matches memory-ledger's own documented choice for `ForgetReason`: an exhaustiveness helper with no real
exhaustive `switch` consuming it anywhere in the milestone is dead code presented as a guarantee. Only
`Intervention` is exhaustively matched by name in the plan's own M1 success criteria
("`Intervention` is exhaustively matched via an `assertNeverIntervention` helper"), so only it gets one.

## Consequences

- Positive: `halt`/`forced`'s authorization requirement is enforced at three independent layers — the
  required-field type check (stops accidental construction), the missing-minting-function structural gap
  now backed by a real symbol-resolving checker scan (stops convenient construction, including through an
  aliased or re-exported import), and `assertValidHaltForced`'s runtime guard (stops a cast that drops or
  blanks a field entirely) — each catching a failure mode the layer below it cannot, and none of the three
  claimed, after L4 VERIFY's review, to stop a fully-formed cast written deliberately through `unknown` at
  the outer type. That remaining gap is disclosed by name in Decision 2, not papered over.
- Positive: real falsifiability experiments were run against this milestone's own code throughout (not
  just described) and are recorded in the PR report: deleting the stand-in `"reassign"` case broke
  `npm run typecheck` with `TS2345` at the exact line predicted; weakening `assertValidHaltForced` to skip
  its `conflictId` check broke exactly one test with a clear assertion mismatch; and, after L4 VERIFY's
  review, reverting the new checker scan's alias-following broke six tests including plain, un-aliased
  cross-file casts — confirming alias-following is load-bearing for the whole mechanism, not an edge-case
  add-on. None was a false pass.
- Negative / cost: `Conflict` and `ResourceClaim` do not yet carry an `id` field despite `Intervention`
  and `.genesis/DONE.html` presuming one exists somewhere reachable — M3 inherits an explicit, named gap
  instead of a guessed answer that might have been wrong. This is treated as the correct trade at this
  milestone, not a shortcut: `lib/contracts/**` freezes after M1, and a wrong guess here would have been
  far more expensive to unfreeze later than an honestly stated gap is to close in M3.
- Negative / cost: `HumanId` having no minting function means every test fixture in this milestone (and,
  presumably, every later milestone's tests) must construct one via an inline unsafe cast rather than a
  clean constructor call — a small, deliberate friction, accepted because the alternative (a convenience
  constructor) would undercut the one guarantee this project is proudest of.

## Alternatives rejected (summary, cross-referenced above)

- Reusing decision-engine's `Decision` outcome shape for `Intervention` (Decision 1) — no field-for-field
  correspondence exists once actually written out; the plan's own report already rejects it at the design
  level.
- A `humanId()` minting function matching the other five id brands' shape (Decision 2) — would make
  fabricating a human authorization one function call away from `lib/contracts` itself; independent
  verification's Bypass 2 directly demonstrates this is exactly what an aliased import lets a caller do.
- A text/regex-based cast scanner, patched to also catch aliased imports (Decision 2) — the account's own
  precedent (`shadow-run`'s architecture test, five rounds of tokenizer patches) argues directly against
  growing this kind of machinery; replaced with a real, checker-based symbol resolution instead.
- Strengthening `assertValidHaltForced` with a self-computed binding check (e.g. a hash of
  `authorizedBy`+`conflictId`) to try to catch Bypass 1 (Decision 2) — any check computable from data the
  function already holds is a check an attacker with `as unknown as X` access could compute identically;
  would be theater, not defense.
- Guessing `Conflict`'s and `ResourceClaim`'s missing `id` fields now, before `lib/conflict/**` exists to
  verify the guess (Decision 3) — risks freezing a wrong shape into a file that cannot be unfrozen
  cheaply.
- `CapturedAt`-style future-dated rejection for `Timestamp` (Decision 4) — would make plan §5's own
  failure-suite case 7 (a future-dated heartbeat) impossible to construct.
- Branding `ResourceClaim.ttl` (Decision 5) — no stated invariant to validate at this milestone.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
