# ADR 0003 — M3 conflict detection: closing the `Heartbeat` and `ConflictId` gaps, the hostile-input return type, and why no timestamp is ever compared

- **Date:** 2026-09-22
- **Status:** accepted
- **Phase / milestone:** M3 (BUILD) — `lib/conflict/**`

## Context

`.genesis/PLAN.md` §4's M3 entry scopes this milestone to `detectConflicts(claims:
ResourceClaim[], heartbeats: Heartbeat[]): Conflict[]` — pure, order-independent, idempotent,
no gating (M4), no arbitration (M5), no interventions. `lib/contracts/**` (M1) is frozen after
five verification rounds (`.genesis/decisions/0001-contracts.md`) and must not be modified;
this milestone's own scope is `lib/conflict/**` and this file. Three things had to be resolved
before a single line of detection logic could be written, none of them solvable by silently
picking an answer:

1. **`Heartbeat` does not exist anywhere in this repository.** `grep -rn "Heartbeat" lib/`
   returned nothing before this milestone. The plan's own §3 pipeline diagram and §4 M3
   signature both name `Heartbeat[]` as a real input type, and `.genesis/DONE.html` lists it
   among the typed inputs a ruling is built from — but M1's six frozen contracts
   (`Corroboration`, `ResourceClaim`, `CheckpointDeclaration`, `Conflict`, `Intervention`,
   `ConflictSeverity`) never include it. This is a genuine plan gap, not a naming mismatch.
2. **`Conflict` and `ResourceClaim` carry no `id` fields**, exactly as
   `0001-contracts.md` Decision 3 names and deliberately leaves open: "a call for M3 to make
   and document in its own ADR." `Intervention`'s `halt`/`forced` variant needs a
   `conflictId: ConflictId` to bind an authorization to a specific conflict, and
   `.genesis/DONE.html`'s locked spec requires a ruling to "always cite the conflict id" — but
   a bare 3-value `Conflict` enum has no field to hold one.
3. **A bare `Conflict[]` return type cannot express "detection could not run."** Plan §4 M3's
   own "what it refuses" bullet requires refusing "to crash on a hostile claims array (throwing
   getter, `Proxy`)," with a falsifiability check demanding "a typed failure result, never an
   uncaught exception" — but an array has no slot for that.

This ADR records the decision for each, and a fourth, smaller decision about how
order-independence and idempotence are actually proven (a property-based sweep with a
hand-rolled seeded PRNG, not a new test dependency).

## Decision 1 — `Heartbeat`, owned by `lib/conflict/**`, not smuggled into frozen `lib/contracts/**`

`lib/conflict/heartbeat.ts` defines:

```ts
export interface Heartbeat {
  readonly agentId: AgentId;
  readonly resourceId: ResourceId;
  readonly at: Timestamp;
}
```

Three fields, no more: plan §2's own definition of `undeclared-access` ("a heartbeat shows an
agent touched a resource it never claimed") is the only place the plan ever describes what a
heartbeat needs to carry, and it needs exactly two identifying facts (which agent, which
resource) plus an instant, for the same reason `ResourceClaim.declaredAt` carries one. No
`corroboration` field — a heartbeat's own `Corroboration` level is a live-agent-communication
design question with no consumer in this milestone to test the answer against, the same
"don't guess a field nothing downstream needs yet" reasoning `0001-contracts.md` Decision 5
already applies to `ResourceClaim.ttl`.

**Alternative considered and rejected: add `Heartbeat` to `lib/contracts/**` instead.**
Rejected outright — `lib/contracts/**` is frozen after M1's five verification rounds, and this
milestone's own scope is `lib/conflict/**` and this file, nothing else. Reusing the identical
`AgentId`/`ResourceId`/`Timestamp` brands `lib/contracts/ids.ts` and `timestamp.ts` already
export gets the benefit of the frozen module (no silent `string` mixups between an `AgentId`
and a `ResourceId`) without touching a single frozen file.

**Alternative considered and rejected: give `Heartbeat` more fields now (a `corroboration`
level, a sequence number) to anticipate M4/M5/M7's later needs.** Rejected for the same reason
`0001-contracts.md` Decision 3 refused to guess `Conflict`'s and `ResourceClaim`'s missing
`id` shape before a real consumer existed to test the guess against, and the same reason this
account's own standing note (`speculative-flexibility-costs-rounds.md`) names directly:
tolerating a field nobody has asked for yet tends to produce exactly the kind of drift a later,
narrower fix has to undo. If M4, M5, or M7 need more from a heartbeat, that milestone extends
this file and documents why in its own ADR.

## Decision 2 — `DetectedConflict`, closing the `ConflictId` half of `0001-contracts.md`'s named gap; the `ResourceClaimId` half stays open

`lib/conflict/detected-conflict.ts` defines:

```ts
export interface DetectedConflict {
  readonly id: ConflictId;
  readonly kind: Conflict;
  readonly resourceId: ResourceId;
  readonly agentIds: NonEmptyArray<AgentId>;
}
```

`Conflict` itself (`lib/contracts/conflict.ts`) is untouched and lives here as `kind` — this
file adds a new type in `lib/conflict/**`, it does not modify the frozen enum. `id` is minted
by `deriveConflictId(kind, resourceId, agentIds)`, which sorts and deduplicates `agentIds` and
joins `kind`/`resourceId`/the agent list with `|` before calling `lib/contracts/ids.ts`'s own
`conflictId(raw: string): ConflictId` — the one blessed constructor for that brand, not a
second minting function invented here.

**Why deterministic, not random (e.g. `crypto.randomUUID()` per detected conflict): this is
the actual mechanism the order-independence and idempotence proofs rest on.** A random id
would make `detectConflicts(shuffle(claims), heartbeats)` and `detectConflicts(claims,
heartbeats)` produce two DIFFERENT ids for the identical logical conflict, failing the plan's
own "deep-equal `Conflict[]` output across all permutations" falsifiability check by
construction — no amount of correct conflict-finding logic underneath could ever pass that
check with a random id layered on top. Determinism turns "same participants, same kind, same
resource" into "same id," which is what lets `__tests__/order-independence.test.ts` and
`__tests__/idempotence.test.ts` compare whole result arrays with a plain `toEqual`.

**Honest limit, stated once, not silently accepted: the `|`-joined id string can collide for
an adversarially-crafted id containing `|`.** `lib/contracts/ids.ts` states plainly that
`AgentId`/`ResourceId` carry "no invariant beyond being a string" — no alphabet restriction —
so `deriveConflictId("write-write", resourceId("R"), [agentId("a|R2")])` and
`deriveConflictId("write-write", resourceId("R|a"), [agentId("R2")])` produce the identical
string `"write-write|R|a|R2"`. Not fixed with an escaping scheme: this milestone has no
evidence a real agent/resource id will ever contain `|`, and inventing an escaping scheme
against a hypothetical adversarial id is exactly the unrequested-flexibility shape this
account's own standing note warns against. `__tests__/detected-conflict.test.ts` pins this
collision as a real, passing, disclosed-limit assertion — not a silently-undiscovered gap a
future verifier would have to find independently.

**What this type deliberately does NOT carry, and why that half of the gap stays open for
M4/M5:** no `claimIds: ResourceClaimId[]` field. `Intervention.quarantine` names
`NonEmptyArray<ResourceClaimId>` as what it revokes, which presumes individual claims are
identifiable — but `ResourceClaim` (frozen) carries no `id` field of its own, and
`0001-contracts.md` Decision 3 left that half of the gap, deliberately, for whichever milestone
first needs to revoke a SPECIFIC claim rather than merely detect that a conflicting one exists.
`detectConflicts`'s own job — plan §4 M3, verbatim: "pure detection... find the conflicts. No
gating, no arbitration, no interventions" — never needs to name an individual claim for
revocation; only M4's gate and M5's arbitration do, once `quarantine` becomes a real candidate
intervention with a specific claim to revoke. Inventing a `ResourceClaimId`-on-a-claim scheme
now, with no consumer in this milestone to test it against, would repeat the exact mistake
`0001-contracts.md` Decision 3 already refused to make for `Conflict`'s id: freezing a guessed
shape before the milestone that actually needs it can verify the guess against real code.

**Stated plainly, per this milestone's own task: this milestone closes the `ConflictId` half of
the gap `0001-contracts.md` named, because it is the first milestone that needs one to satisfy
`Intervention.halt.forced.conflictId` and `.genesis/DONE.html`'s "always cite the conflict id."
It deliberately does NOT close the `ResourceClaimId`-identifies-a-claim half, because M3's own
scope has no code that needs to look up or revoke an individual claim — that remains M4/M5's
gap to close, against their own real code, exactly as `0001-contracts.md` anticipated.**

## Decision 3 — `DetectionResult`, not a bare `Conflict[]`/`DetectedConflict[]`

`lib/conflict/detection-result.ts`:

```ts
export type DetectionResult =
  | { readonly ok: true; readonly conflicts: readonly DetectedConflict[] }
  | { readonly ok: false; readonly error: DetectionFailure };

export interface DetectionFailure {
  readonly kind: "hostile-claims-input" | "hostile-heartbeats-input";
  readonly message: string;
}
```

Re-derives `lib/contracts/intervention.ts`'s own "typed result, not a thrown exception" shape
(`HaltForcedResult`) independently for this module, rather than importing it — `lib/contracts`
is frozen and out of scope to extend, and there is no principled reason `DetectionFailure`
should share a type with `InvalidHaltForced` beyond both being discriminated results; importing
it would couple two unrelated failure shapes for no real benefit.

**Alternative considered and rejected: keep the plan's literal `Conflict[]` signature and let
a hostile input throw, documented as a known limitation.** Rejected — plan §4 M3 states this
refusal in the SAME breath as order-independence and idempotence, as one of exactly three
named "what it refuses" bullets for this milestone, and its own falsifiability check names the
exact test ("a `Proxy` that throws on property access... asserts a typed failure result, never
an uncaught exception") that a throwing implementation would fail outright. This is not
optional hardening; it is one third of this milestone's stated scope.

**Alternative considered and rejected: catch per-hostile-element and return a partial result
(skip the bad claim, keep detecting on the rest).** Rejected — plan §4 M3 asks for "a typed
failure result," i.e., detection as a whole did not run, not a partial result silently missing
whichever element happened to be hostile. A partial result that looks like a complete,
successful scan is arguably worse than an honest failure: a caller (M4's gate, unbuilt) has no
way to tell "detection ran cleanly and found nothing" from "detection silently dropped a
conflict because one input element was hostile."

**Two failure kinds, not one generic `"hostile-input"`:** `hostile-claims-input` and
`hostile-heartbeats-input` are distinguished because `detectConflicts` validates claims fully
before ever touching heartbeats (`__tests__/hostile-input.test.ts` pins this ordering directly:
when BOTH inputs are hostile, the reported failure names the claims side) — a caller can tell
which of its two inputs was the problem, not merely that detection failed somewhere.

## Decision 4 — why `detectConflicts` never reads `declaredAt`, `ttl`, or `corroboration` at all

Plan §4 M3's own refusal list includes: "to guess when two claims' timestamps disagree with
the clock (fails closed to 'cannot order, treat as simultaneous/conflicting,' never picks one
arbitrarily)." This milestone satisfies that refusal by ELIMINATING the need for any timestamp
comparison, rather than adding careful tie-breaking logic: detection asks only "do two
DIFFERENT agents hold structurally incompatible claims (or a claim and an undeclared touch) on
the same resource, as a set, right now" — never "which claim came first" or "which is still
fresh." Two claims with identical, reversed, or nonsensical `declaredAt` values, in any array
order, produce the exact same conflict set, because `declaredAt` is never read by
`detect-conflicts.ts` at all. `__tests__/order-independence.test.ts`'s property-based sweep
randomizes `declaredAt` independently of every other field specifically to make this claim
falsifiable, not merely asserted.

The same reasoning extends to `ttl` (staleness — `0001-contracts.md` Decision 5 already states
this is `availableInterventions`'s job, M4, unbuilt) and `corroboration` (which governs whether
an INTERVENTION may be offered, not whether a conflict exists — plan §4 M4, not M3). "Claimed,"
for `undeclared-access` purposes, means "some `ResourceClaim` in the input names this exact
`(agentId, resourceId)` pair" — full stop, regardless of mode, `ttl`, or `corroboration` — not
"names it and has not yet expired." `detectConflicts`'s own signature has no `now` parameter
(unlike M4's `availableInterventions(agent, claim, checkpoint, now)`), so it has no legitimate
clock to filter by even if it wanted to.

**Consequence, stated for M4/M5/M7 to inherit deliberately:** a conflict this function reports
may involve a claim that has technically expired by `ttl`. Whether the gate should still act on
an expired claim's conflict is a different, later question `availableInterventions` answers,
not one `detectConflicts` pre-empts by silently filtering expired claims out of the conflict set
before M4 ever sees them.

## Decision 5 — grouping model: one `DetectedConflict` per `(resourceId, kind)`, not per colliding pair

For `write-write` and `write-read`, `detectConflicts` reports one `DetectedConflict` per
`(resourceId, kind)` naming every distinct participating agent — three agents all holding
`exclusive` claims on one resource is one `write-write` conflict naming all three, not three
pairwise conflicts. Nothing in plan §2's definition ("two claims want exclusive/write on the
same resource") requires pairwise reporting.

**This is also the concrete mechanism idempotence rests on, not just a convenient
simplification:** `groupClaimsByResource` stores participants in a `Set<string>`, keyed by
`agentId`. A `Set` cannot contain the same value twice no matter how many identical or
near-identical claims that agent re-declares — so "an agent re-declaring the identical claim"
(plan §4 M3's own idempotence refusal, verbatim) cannot inflate this function's output by
construction, not merely by a dedup pass bolted on afterward. This was verified directly, not
merely argued: see the "Falsifiability" section below for the exact sabotage-and-restore
experiment run against this milestone's own code.

`undeclared-access` is reported per `(resourceId, agentId)` pair instead — one agent's
undeclared touch is independent of any other agent's, so grouping distinct agents under one
shared conflict record the way `write-write` does would blur together unrelated collisions with
no basis in the plan's own definition.

## Decision 6 — no new test dependency for the property-based order-independence proof

The milestone's own task explicitly asks for "a property-based approach over generated inputs
rather than a handful of fixtures." `lib/conflict/__tests__/fixtures.ts` implements a ~15-line
`mulberry32` seeded PRNG and a Fisher-Yates `shuffle`, used by
`__tests__/order-independence.test.ts` (150 randomly generated scenarios × 5 shuffles each,
plus an exhaustive 4!/3! permutation check on two fixed scenarios) and
`__tests__/idempotence.test.ts` (200 randomly generated scenarios, run twice each).

**Alternative considered and rejected: add `fast-check` (or similar) as a devDependency.**
Rejected for two concrete reasons, not merely "not invented here": (1) adding any new package
requires `npm install` at least once to regenerate `package-lock.json`, and `.genesis/PLAN.md`
§6 documents, by citation, that npm 11.5.1 has a live bug
([npm/cli#4828](https://github.com/npm/cli/issues/4828)) that can silently drop the
platform-specific `@rolldown/binding-*` package Vitest resolves through — this repo's own
standing rule is `npm ci` only, never `npm install`, precisely to avoid re-triggering that
failure mode, and a new dependency cannot be added without running the forbidden command at
least once; (2) it would require adding a new specifier to
`lib/contracts/__tests__/import-containment.test.ts`'s `ALLOWED_EXTERNAL_SPECIFIERS` — a
deliberate widening of the closed-module-graph security boundary
`.genesis/decisions/0001-contracts.md` Decision 2 (round 5) built specifically to have no casual
additions. A seeded PRNG this small needs neither risk for a benefit (property-based generation
over a bounded, well-understood domain) a hand-rolled generator provides just as well.

**This milestone needed zero changes to `ALLOWED_EXTERNAL_SPECIFIERS`.** Every file under
`lib/conflict/**` imports only from `lib/contracts/*.js` (relative, inside `lib/`) and
`vitest` (already allowlisted, test files only) — confirmed by running
`lib/contracts/__tests__/import-containment.test.ts` and `file-inventory.test.ts` after adding
this milestone's files, both still green with no edit to either test.

## Falsifiability — the experiment actually run, not merely described

`groupClaimsByResource` (`detect-conflicts.ts`) was temporarily rewritten to use plain arrays
instead of `Set`s for `writeAgents`/`readAgents`, and the `write-write` threshold check changed
from "at least 2 DISTINCT agents" (`.size >= 2`) to "at least 2 claim entries" (`.length >= 2`)
— reintroducing exactly the failure mode the plan's own idempotence refusal names: an agent
re-declaring claims (even non-identical ones) now counted toward its own conflict threshold.
`npm run typecheck` stayed clean (this is a runtime behavior bug, not a type error) and
`npx vitest run lib/conflict` immediately failed two tests with precise, non-vacuous diffs:

- `detect-conflicts.test.ts`: *"the SAME agent holding two different (non-identical) write
  claims on one resource is not write-write against itself"* — expected `{ conflicts: [] }`,
  received a fabricated `write-write` conflict naming only `agent-a` against itself.
- `idempotence.test.ts`: *"a scenario built from 50x-duplicated claims/heartbeats matches the
  equivalent de-duplicated scenario exactly"* — the 50x-duplicated run produced an extra,
  spurious `write-write` conflict the de-duplicated baseline did not.

The sabotaged file was restored from a pre-edit backup; `npm run typecheck` and `npm test`
were re-run and confirmed clean (18 files / 273 tests) before any commit was made. This is the
milestone's own required falsifiability check, run for real against its own most
consequential design claim (idempotence is structural, not incidental), not asserted from
reading the code alone.

## Consequences

- Positive: `Heartbeat`, a genuine plan gap (referenced by `.genesis/PLAN.md` §3/§4 and
  `.genesis/DONE.html`, defined nowhere), now exists — owned by `lib/conflict/**`, not
  smuggled into frozen `lib/contracts/**`.
- Positive: the `ConflictId` half of `0001-contracts.md`'s named gap is closed, deterministically
  (never randomly), which is the actual mechanism this milestone's order-independence and
  idempotence proofs rest on — verified, not merely argued, by a real sabotage-and-restore
  experiment against the exact `Set`-based construction that provides it.
- Positive: hostile input (a throwing getter, a `Proxy`) on EITHER `claims` or `heartbeats` is
  caught and reported as a typed, discriminated failure — proven with real `Proxy`/getter
  fixtures in `__tests__/hostile-input.test.ts`, not merely typed and left untested.
- Positive: zero changes to `ALLOWED_EXTERNAL_SPECIFIERS` or `lib/contracts/**` — the
  closed-module-graph tests from M1 (`file-inventory.test.ts`, `import-containment.test.ts`)
  pass unmodified against this milestone's new files, confirmed by running them directly.
- Negative / cost: the `ResourceClaimId`-identifies-a-claim half of `0001-contracts.md`'s named
  gap is still open, deliberately, for M4/M5 to close against their own real code (`quarantine`'s
  `revokedClaims`) — this milestone's own scope never needed to look up an individual claim by
  id, so closing that half here would have been exactly the kind of guess `0001-contracts.md`
  Decision 3 already refused to make once.
- Negative / cost: `deriveConflictId`'s `|`-separator join can theoretically collide for an
  agent/resource id that itself contains `|` — disclosed and pinned with a real passing test
  (`__tests__/detected-conflict.test.ts`), not silently accepted as a hidden gap, but not fixed
  with an escaping scheme either, per Decision 2's reasoning.
- Negative / cost: `detectConflicts` deliberately ignores `ttl`/staleness when deciding whether a
  claim counts as "held" for `undeclared-access` purposes — a conflict may name a claim that has
  technically expired. This is a stated, deliberate scope boundary (Decision 4), inherited by
  M4 as a build requirement, not a bug this milestone silently worked around.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
