# ADR 0001 — M1 contracts: alternatives considered, and the two gaps the plan leaves for M3/M4/M5 to close

- **Date:** 2026-09-22
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

## Decision 2 — the "no engine may construct `halt`/`forced` on its own initiative" refusal is enforced two ways, not one, because a required field alone is not enough

The plan states this refusal but does not specify a mechanism beyond "no engine milestone (M3, M4, or
M5) may construct this variant." A required `authorizedBy: HumanId` field stops an *accidental*
construction (an object literal missing the field fails to compile) but, on its own, does nothing to
stop a *deliberate* one: any file importing a hypothetical `humanId(raw: string): HumanId` — the exact
shape `agentId()`/`resourceId()`/`resourceClaimId()`/`checkpointId()`/`conflictId()` all use in `ids.ts`
— could call `humanId("approved")` from inside `lib/gate` or `lib/arbitrate` and produce a fully
type-valid `halt`/`forced` value with zero real human involvement. That is the exact "trust the
self-report" failure this whole project exists to refuse, just relocated one level down into the id
brand instead of the intervention itself.

**Alternative considered and rejected: give `HumanId` a minting function identical in shape to the other
five id brands', and rely on the required-field check alone.** This is what every other id brand in this
milestone does (`ids.ts`), and it would have been the path of least resistance — the plan does not
explicitly forbid it. Rejected because the five other id brands are pure identity tokens (nothing
downstream treats "I have one of these" as evidence of anything beyond naming a thing); `HumanId` is not
identity, it is a trust claim, and a project whose central selling point is "an automated engine may
never manufacture this" should not make manufacturing it one function call away from `lib/contracts`
itself.

**Chosen:** `human-id.ts` exports the `HumanId` brand with **no minting function anywhere in `lib/`**.
`__tests__/human-id.test.ts` greps every non-test file under `lib/` for a cast into this brand (the same
allowlist/denylist-scan technique decision-engine's `brand-casts.test.ts` and shadow-run's
`architecture.test.ts` both use for an equivalent problem) and fails the build if one appears — with no
excluded "defining file" the way `Confidence`/`CostOfBeingWrong` exclude `confidence.ts`/`cost.ts`,
because no file in this codebase is meant to have that exemption. Test fixtures are the sole allowed
exception (a test asserting a literal string into the brand to build a sample `Intervention`), matching
the identical test-file exemption `brand-casts.test.ts` documents.

This still is not an unforgeable guarantee, and the account's own standing note ("don't restate a
disclosed limit more strongly") applies directly: it is a static, greppable check, not a cryptographic
one. It cannot stop a determined author from renaming the brand, editing `human-id.ts` itself, or
smuggling a value across an untyped `any` boundary the scan can't see. It closes exactly one door — the
convenience-constructor door every other id brand in this file deliberately leaves open — and is stated
here as closing that door and no more.

**Real falsifiability incident found while building this test, worth recording:** the first version of
`human-id.ts`'s own header comment used the literal phrase `` `as HumanId` `` three times while
*documenting* the scan. Because the scan walks every non-test `.ts` file's source text line by line
(comments included, by design — a cast hidden in a string-concatenation trick would still need to spell
the type name eventually), the grep matched its own governing file's prose and failed `npm test` on the
very first run. This was the correct behavior, not a bug — the fix was rewording the three comment lines
to describe the cast without spelling it literally, not weakening the pattern. It is direct, in-repo
evidence the check reads real source text rather than being a check that could not fail.

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
  required-field type check, the missing-minting-function structural gap, and `assertValidHaltForced`'s
  runtime guard against a value that reached the shape via an unsafe cast — each catching a failure mode
  the layer below it cannot.
- Positive: two real falsifiability experiments were run against this milestone's own code (not just
  described) and are recorded in the PR report: deleting the stand-in `"reassign"` case broke
  `npm run typecheck` with `TS2345` at the exact line predicted, and weakening `assertValidHaltForced` to
  skip its `conflictId` check broke exactly one test (`rejects a value missing conflictId even when
  authorizedBy is present`) with a clear assertion mismatch, not a false pass.
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
  fabricating a human authorization one function call away from `lib/contracts` itself.
- Guessing `Conflict`'s and `ResourceClaim`'s missing `id` fields now, before `lib/conflict/**` exists to
  verify the guess (Decision 3) — risks freezing a wrong shape into a file that cannot be unfrozen
  cheaply.
- `CapturedAt`-style future-dated rejection for `Timestamp` (Decision 4) — would make plan §5's own
  failure-suite case 7 (a future-dated heartbeat) impossible to construct.
- Branding `ResourceClaim.ttl` (Decision 5) — no stated invariant to validate at this milestone.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
