# ADR 0005 — M5 arbitration: the claim-identity ruling, a second gap found while building (`CheckpointId`), a plan defect in `severity`'s own shape, and the never-exceed-the-gate property's actual mechanism

- **Date:** 2026-09-22 (revised the same day, after L4 VERIFY rejected the first version of this PR
  having found and reproduced a live bypass of the never-exceed-the-gate property's own
  per-conflict-authorization half — see Decision 8 for the report, the fix, and the correction of an
  overclaim this ADR's own first version made)
- **Status:** accepted
- **Phase / milestone:** M5 (BUILD) — `lib/arbitrate/**`

## Context

`.genesis/PLAN.md` §4's M5 entry scopes this milestone to `arbitrate(conflicts: Conflict[],
available: AvailableInterventionSet[], severity: ConflictSeverity, humanAuthorization?:
HumanAuthorization): InterventionRuling[]` — "the decision layer, selecting per conflict the
strongest intervention both permitted by M4's gate and warranted by severity, always citing the
conflict id, the rule, and the evidence." `lib/contracts/**` (M1), `lib/conflict/**` (M3), and
`lib/gate/**` (M4) are all frozen/settled inputs; this milestone's own scope is `lib/arbitrate/**`
and this file. `.genesis/decisions/0004-gate.md` Decision 3 names, at real weight, an unresolved
obligation this milestone inherits: "nothing in the pipeline built so far carries per-claim
identity at all... M5 will need either a `lib/contracts` unfreeze or a signature departure to
close it." Building this milestone surfaced a second gap of the identical shape
(`CheckpointId`, not named anywhere in the plan or either prior ADR) and a genuine plan defect
in `severity`'s own shape, neither guessed at, both argued below.

## Decision 1 — the claim-identity question: a `lib/arbitrate`-owned wrapper, NOT a `lib/contracts` unfreeze

**Stated loudly and first, per this milestone's own instructions: no `lib/contracts` unfreeze was
used or needed anywhere in this milestone.** `git diff main -- lib/contracts lib/conflict lib/gate`
is empty — confirmed directly, not merely claimed (see Verification below). The narrower route was
taken.

**The argument for the narrower route, against the unfreeze this ADR explicitly considered and
rejected:** `.genesis/decisions/0001-contracts.md` Decision 3 froze `ResourceClaim` at exactly six
fields, with no `id`, after FIVE independent verification rounds hardened every file in
`lib/contracts/**` — the freeze itself is not a formality; it is the thing this account's own
`0001-contracts.md` calls "worse... far more expensive to unfreeze later than an honestly stated
gap is to close" when discussing why M1 left the gap open in the first place. Unfreezing
`ResourceClaim` now, three milestones later, to add `id: ResourceClaimId`, would:

1. **Reopen a boundary five rounds of adversarial review already closed**, for a change this
   milestone does not structurally need — see point 3 below.
2. **Force every existing consumer of `ResourceClaim`** (`lib/gate/available-interventions.ts`'s
   own signature takes a bare `ResourceClaim`) to re-justify why an untouched field addition is
   safe, work this milestone's own scope (`lib/arbitrate/**` and this file only) has no license to
   do to `lib/gate/**`.
3. **Would not even be sufficient by itself.** Adding `id` to `ResourceClaim` closes only the
   `ResourceClaimId` half of the gap `0001-contracts.md` Decision 3 named. This milestone found,
   while actually building it (Decision 2, below), that `quarantine`'s `revokedClaims` is not the
   only field this milestone needs an id for — `pause`/`halt`/`checkpointed` need a `CheckpointId`
   too, and `CheckpointDeclaration` is equally frozen. An unfreeze route would need to touch TWO
   frozen files, not one, to close what one small, new, `lib/arbitrate`-owned type closes with a
   single addition.

**Chosen:** `lib/arbitrate/arbitration-participant.ts` defines `ArbitrationParticipant { agentId,
resourceId, claimId: ResourceClaimId, checkpointId?: CheckpointId }` — a new, M5-owned wrapper
correlating a conflict's participants to the two concrete ids `arbitrate` needs to construct real
`Intervention` values (`revokedClaims` for `quarantine`; `checkpointId` for `pause`/`halt`/
`checkpointed`), without touching `ResourceClaim` or `CheckpointDeclaration` at all. `arbitrate`'s
own signature gains one new parameter, `participants: readonly ArbitrationParticipant[]` — the
identical "the plan's prose and its own later requirement pull in different directions, so build
the richer shape the requirement actually needs and document it" move `DetectedConflict` (M3) and
`AvailableInterventionKind` (M4) already made, applied here for the same reason.

**Correlation, not lookup:** `arbitrate` never looks a claim up "by id" anywhere — it filters
`participants` down to the ones naming this conflict's own `resourceId` and one of its
`agentIds` (`relevantParticipants`, `arbitrate.ts`), the same `(resourceId, agentId)` correlation
`lib/conflict/detect-conflicts.ts`'s own private `claimedPairKey` already uses for the identical
question, re-derived independently rather than reached into (a private helper in a sibling
milestone's module is not part of that module's public surface, `lib/conflict/index.ts`).

## Decision 2 — a second gap of the identical shape, found while building, not named anywhere before this milestone: `CheckpointId`

`Intervention.pause` and `Intervention.halt`/`checkpointed` (both frozen, `lib/contracts/
intervention.ts`) each require a `checkpointId: CheckpointId`. Nothing before this milestone ever
carries one downstream of a real `CheckpointDeclaration` value: `lib/gate/available-
interventions.ts` never constructs an `Intervention` at all (`AvailableInterventionKind` is a bare
string label), so `lib/gate/**` never needed to plumb a `CheckpointId` anywhere. This milestone is
the first that actually assembles a `pause`/`halt`/`checkpointed` literal, and therefore the first
that needs a concrete `CheckpointId` to put in it — the identical shape of gap
`0001-contracts.md` Decision 3 named for `ResourceClaimId`, on a different field, discovered here
rather than inherited from a prior ADR's own naming of it.

**Closed the same way, by the same type:** `ArbitrationParticipant.checkpointId` is `optional`
(`exactOptionalPropertyTypes`, `tsconfig.lib.json` — a caller with no checkpoint for a given
participant OMITS the field, never sets it to `undefined`), because not every agent party to a
conflict has necessarily declared one (`CheckpointDeclaration`'s own header: "only the agent that
is actually running can know its own safe-stop points").

**A real, disclosed design question this decision had to answer, not merely note:** a conflict can
name several agents. If they disagree about `checkpointId`, or only some of them supply one at
all, which one does a single `pause`/`halt`/`checkpointed` `Intervention` (which carries exactly
ONE `checkpointId`) cite? **Chosen: neither guess nor pick an aggregation policy not named
anywhere in the plan (earliest declared, most-agents-agree, etc.) — fail closed.**
`uniqueCheckpointId` (`arbitrate.ts`) resolves a `CheckpointId` only when every relevant
participant that supplies one supplies the SAME one; zero participants supplying one, or two-plus
DISAGREEING, both resolve to `null` ("cannot realize this rung"), which degrades the ruling to the
next weaker realizable rung (`rule: "checkpoint-unrealizable"`) rather than fabricate a pick. This
mirrors `.genesis/decisions/0003-detection.md` Decision 4's own "cannot order, treat as
simultaneous/conflicting, never pick one arbitrarily" refusal, re-derived independently here for a
different comparison (agreement, not ordering).

**Alternative considered and rejected: invent an aggregation policy (e.g., "use the first agent's
checkpoint, sorted by agent id").** Rejected — no such policy is named anywhere in the plan, and
picking one arbitrarily among disagreeing agents' own safe-stop claims is exactly the kind of
guess `0001-contracts.md` Decision 3 and `0003-detection.md` Decision 4 already refuse to make
elsewhere in this codebase. A truthful "could not be realized" answer, with a named, typed
degradation path, is more honest than a fabricated pick a reviewer could not audit.

## Decision 3 — `severities: readonly ConflictSeverity[]`, not the plan's literal, singular, batch-wide `severity: ConflictSeverity`: a genuine plan defect, not a guess

`.genesis/PLAN.md` §4 M5's own literal signature pairs a single `severity: ConflictSeverity` with
an ARRAY of `conflicts` and an ARRAY of `available` — one severity value shared across an entire
batch of conflicts. This does not survive contact with `lib/contracts/conflict-severity.ts`'s own
header, frozen at M1: severity "is computed from the conflicting resource's declared blast radius
and the conflict kind" — a fact that is, by that same file's own words, PER-CONFLICT (different
conflicts in one batch ordinarily have different kinds and different resources, and therefore
ordinarily different blast radii). A single shared severity cannot express that a `write-write`
conflict on a database and an `undeclared-access` touch on a log file, ruled on in the same
`arbitrate` call, might warrant entirely different responses.

**This is judged a genuine, unforced plan defect** — not a case where a stricter reading of "one
call rules on one conflict at a time" resolves it, because the plan's own signature accepts
`conflicts: Conflict[]` (plural) in the same breath, and `.genesis/PLAN.md` §4 M5's own
falsifiability check describes constructing "A `corrupting`-severity conflict" (singular) only as
one worked EXAMPLE, never stating the function is called once per conflict. The two-array,
one-scalar shape as literally written is internally inconsistent, the same class of finding M3
found for `Heartbeat` (undefined) and M4 found for the mode-blind `Set<Intervention["kind"]>`
(cannot express what the same sentence asks for) and the contradictory "no channel to a human"
gate-return-type versus M5's own "may select `forced`" refusal (see Decision 4, below).

**Chosen:** `severities: readonly ConflictSeverity[]`, index-paired with `conflicts` — the
identical convention the plan's own literal text already uses for `available`, extended by one
more array rather than invented as a new, differently-shaped batching style (a single combined
per-conflict record type was considered — see Decision 5, below — and rejected as a larger
departure than the defect actually requires).

**Alternative considered and rejected: keep `severity` singular and document that a caller must
call `arbitrate` once per conflict if severities differ.** Rejected — this pushes the actual
per-conflict correctness requirement onto every future caller (M6's domain script, M8's demo) with
no type-level enforcement that they actually do so, and produces a function that returns
`InterventionRuling[]` (plural, batch-shaped) from a signature that can only honestly serve ONE
conflict at a time — an internally inconsistent shape this milestone would be perpetuating, not
fixing. The array form makes the real constraint (one severity per conflict) a fact the type
checker enforces via the length-equality precondition (Decision 6, `arbitrate.ts`'s own header),
not a documentation-only convention a caller could silently violate.

## Decision 4 — resolving the "never exceed the gate" vs. "must be able to produce `halt`/`forced`" contradiction: `halt`/`forced` is not bound by `available` at all — it is bound by a separate, human-authorized channel the gate structurally cannot speak to

**A second real contradiction, found while designing the selection algorithm, not inherited from
a prior ADR:** plan §4 M5's own "what it refuses" list states both "to select an intervention kind
the paired `AvailableInterventionSet` did not contain" AND "to produce `halt`/`forced` without a
`humanAuthorization` whose `conflictId` matches" (implying it MAY produce `halt`/`forced` WITH one)
— but `AvailableInterventionKind` (`lib/gate/available-interventions.ts`, frozen at M4) has
**structurally no member** naming the human-authorized halt mode at all
(`.genesis/decisions/0004-gate.md` Decision 1: "there is no third, halt-shaped member... no code
path... could ever produce one"). Read literally, together, these two refusals are impossible to
satisfy simultaneously: `available` can never contain a kind naming `halt`/`forced`, so a rule that
says "never select what `available` doesn't contain" would make selecting `halt`/`forced` under
ANY condition a violation of the first refusal.

**The resolution, argued, not silently picked:** the gate's own return type is not merely
INCOMPLETE with respect to `halt`/`forced` — it is, by M4's own design (`.genesis/decisions/
0004-gate.md` Decision 1), DELIBERATELY SILENT on it, because "this engine has no channel to a
human and must not manufacture authorization." A type being silent about a question is different
from a type answering "no" to it. This milestone reads "never select a kind `available` did not
contain" as governing the ORDINARY, gate-permitted ladder — the five kinds the gate is actually
authoritative about — and reads `halt`/`forced` as a SIXTH, structurally separate lane the gate
was never in a position to grant OR withhold, whose own, sole gating condition is a per-conflict-
matched `HumanAuthorization` (a value the gate never sees and could not have an opinion about).

**Built accordingly:** `severity-ladder.ts`'s `ArbitrationRung` type is `AvailableInterventionKind
| "halt-forced"` — a strict superset, never fed back into `lib/gate/**` (that module stays
untouched; `git diff main -- lib/gate` is empty). `arbitrate.ts`'s own selection algorithm
(`ruleOneConflict`) makes this a visible, structural fact, not merely a comment: every non-forced
candidate is drawn from `ALL_ARBITRATION_RUNGS.filter(isGateRung).filter((r) => available.has(r))`
— literally intersected with the caller's own `available` set — while `halt-forced`'s own
realizer (`realizeHaltForced`) checks `matchesConflict(humanAuthorization, conflict.id)` and
NOTHING about `available` at all. These are two separate code paths in the same `switch`
(`realize`), never merged, so a reviewer can confirm by reading the function that the two
properties ("never exceed `available`" and "forced needs a per-conflict match") are each fully
enforced, independently, rather than reconciled by a single, harder-to-audit combined condition.

**Also resolves a further, related question the plan leaves implicit: does `SEVERITY_MINIMUM_RUNG`
ever name `halt-forced` as a floor?** No, deliberately (`severity-ladder.ts`'s own header):
`corrupting`'s floor is `quarantine`, the strongest rung the automated ladder can DEMAND on its
own. Severity, a computed fact about a conflict's blast radius, can never by itself require a
human sign-off — only a human's own, already-given authorization can produce that outcome. This
means `halt`/`forced` is reached only through the escalation branch (severity's floor is not met
by anything the gate permits, AND a matching authorization exists) — never because severity alone
"pointed at it."

## Decision 5 — one combined per-conflict input record was considered and rejected in favor of three parallel arrays plus one flat participant pool

Given three findings above (claim identity, checkpoint identity, per-conflict severity), a single
richer type — `ArbitrationCase { conflict, available, severity, participants, checkpoints }`, one
per conflict, replacing all of `conflicts`/`available`/`severities` — was considered, on the
argument that parallel, index-paired arrays are a known source of silent mispairing bugs (a
caller reordering one array but not another).

**Rejected, in favor of the narrower extension actually built:** the plan's own literal signature
ALREADY commits to the index-paired-arrays convention for `conflicts`/`available` — extending it
by one more same-shaped array (`severities`) is a smaller, more conservative departure than
replacing the whole convention with a new record type nothing in the plan anticipates. The
mispairing risk is real but is mitigated structurally, not merely documented: `arbitrate`'s own
precondition (`conflicts.length === available.length === severities.length`, enforced by throwing)
catches a LENGTH mismatch immediately; an ORDER mismatch (same lengths, wrong pairing) is a residual
risk this milestone accepts rather than solves with a heavier type, the same "don't build more
machinery than the found defect actually requires" restraint `.genesis/decisions/0001-contracts.md`
Decision 2 (round 3) already applies to a different, larger design question in this codebase.
`participants`, by contrast, is deliberately NOT index-paired at all — it is matched to each
conflict by real `(resourceId, agentId)` correlation (Decision 1), which has no order-mismatch risk
by construction, because there is no positional index to get wrong.

## Decision 6 — the selection algorithm: proportionality (weakest sufficient rung), never "strongest available regardless"

**The central design call this milestone made, argued at length because the plan's own text
("selecting... the strongest intervention both permitted... and warranted by severity") is
genuinely ambiguous between two readings:**

- **Reading A (rejected):** select the single strongest rung that is BOTH available AND realizable,
  full stop — severity only matters for the `escalationRecommended` flag afterward.
- **Reading B (chosen):** select the WEAKEST available-and-realizable rung that still MEETS OR
  EXCEEDS severity's own floor — i.e., severity sets a minimum, never a target to overshoot merely
  because a stronger tool happens to be sitting in `available` too.

**Why B, not A:** `.genesis/PLAN.md` §1's own thesis, verbatim, is the deciding argument: "the
safest-looking move ('just stop it') is the one most likely to be destructive when the tower is
wrong about what the agent was mid-way through doing." Reading A would make `arbitrate` select
`quarantine` for a merely `contained` conflict whenever `quarantine` happens to be available
alongside `pause` — an escalation the conflict's OWN severity never warranted, purely because a
stronger tool was on the shelf. That is precisely the overreach this project's own central claim
exists to refuse. Reading B is also the only one of the two under which the plan's own single
worked example (corrupting severity, gate permits only `observe`/`warn`, expected result `warn`)
is even distinguishing — both readings agree on that ONE fixture (nothing stronger is available
either way), so the plan's own text does not settle this by example; `.genesis/PLAN.md` §1's
thesis is what actually decides it, and this ADR names that explicitly rather than picking reading
B and calling it "obvious."

**The algorithm, concretely (`arbitrate.ts`'s own `ruleOneConflict`):**

1. Compute this conflict's relevant participants (Decision 1), and from them the one realizable
   `checkpointId` (Decision 2) and `claimIds`, or `null` for either if unrealizable.
2. Build the ordered (weakest-first) list of `available`-and-realizable non-forced rungs.
3. Pick the WEAKEST one meeting or exceeding `SEVERITY_MINIMUM_RUNG[severity]`. If found:
   `rule: "severity-satisfied"`, `escalationRecommended: false`.
4. If none meets the floor: if a per-conflict-matched, well-formed `HumanAuthorization` is
   present, select `halt`/`forced` (`rule: "human-forced-escalation"`,
   `escalationRecommended: false` — a human has already acted, nothing further to escalate).
   Otherwise, fall back to the STRONGEST available-and-realizable rung — the best this conflict's
   own evidence supports — and set `escalationRecommended: true`, with `rule` naming WHY the
   strongest one wasn't strong enough: `"gate-ceiling"` (the gate itself was the limit),
   `"checkpoint-unrealizable"`, or `"quarantine-unrealizable"` (the gate permitted more, but this
   milestone's own participant data could not realize it).

**`SEVERITY_MINIMUM_RUNG`, disclosed as an invented, un-evidenced policy table** (`benign`→
`observe`, `contained`→`pause`, `corrupting`→`quarantine`), the identical honesty
`.genesis/decisions/0004-gate.md` Decision 5 already applies to `STALENESS_BOUND_MS`: some
assignment has to exist for "warranted by severity" to mean anything at all, and no frozen contract
or the plan itself names one. The rung ORDER itself (`observe < warn < pause < halt-checkpointed <
quarantine < halt-forced`) is argued in full in `severity-ladder.ts`'s own header — briefly:
`quarantine` ranks above the checkpoint-anchored modes because the gate only ever permits it once
corroboration has moved past `self-reported` (`lib/gate/available-interventions.ts`), while a
checkpoint's own freshness is itself always `self-reported` by the agent being acted on — placing
`quarantine` above `pause`/`halt-checkpointed` means the automated ladder's own strongest reach
depends on evidence the tower did not have to take the agent's word for, the most defensible
"strongest reach" an automated system can have.

## Decision 7 — `arbitrate`'s hostile-input posture: no discriminated result invented, a plain thrown `Error` for a genuine caller-contract violation only

Unlike M3's `detectConflicts` (which the plan explicitly asks to refuse crashing on a hostile
claims array), plan §4 M5 names no equivalent hostile-input refusal for `arbitrate`. This milestone
does not invent one — matching M4's own precedent (`availableInterventions` added no discriminated
result either, for the identical reason: not asked for). The one precondition this milestone DOES
enforce by throwing — `conflicts.length === available.length === severities.length` — is a
programmer-error/caller-contract violation (the three arrays are index-paired by construction),
not adversarial runtime data the plan asks this milestone to defend against; silently truncating to
the shortest array would silently DROP a conflict from being ruled on, which this codebase already
refuses elsewhere for a different comparison (`0003-detection.md` Decision 4).

**One further, explicitly disclosed and tested exception:** if a caller hands `arbitrate` an
`available` set so malformed it lacks even `"observe"` (the real gate always includes it
unconditionally — this can only happen if a caller bypasses `lib/gate/**` entirely), `arbitrate`
still owes exactly one ruling per conflict and selects `observe` anyway rather than returning
nothing or throwing — `observe` "carries no data" and costs nothing to select even when technically
ungranted (`intervention.ts`'s own header). This is the ONE point in this milestone where a rung
is selected without being present in the caller's own `available` set; it is named, argued, and
pinned by a real test (`__tests__/arbitrate.test.ts`, "available = {observe} only"), not left for
a future reader to discover.

## Decision 8 — L4 VERIFY rejected the first version of this milestone: one authorization licensed a forced halt on a genuinely different conflict sharing its id string; fixed as a fail-closed input precondition, not correlation logic

**This milestone's first PR was rejected by independent review, which found and reproduced a live
bypass of the property this ADR calls the crux (Decision 4).** The report, reproduced verbatim:

```ts
const c1 = conflict("write-write",       "resource-1", ["agent-a"], "shared-id");
const c2 = conflict("undeclared-access", "resource-2", ["agent-b"], "shared-id");
const auth = humanAuthorization("human-1", c1.id);
arbitrate([c1, c2], [availableSet(["observe","warn"]), availableSet(["observe","warn"])],
          ["corrupting","corrupting"], [], auth);
// => BOTH fire kind:"halt", mode:"forced"
```

`c1` and `c2` are genuinely different collisions — different `kind`, different `resourceId`,
different `agentIds` — sharing only a `ConflictId` STRING. `matchesConflict`
(`human-authorization.ts`) is, and remains, pure string equality on `conflictId` — it has no way to
tell "the same logical conflict, asked about twice" from "two unrelated conflicts a caller happened
to label identically." An authorization scoped to `c1` therefore also matched `c2`, and both fired
`halt`/`forced` off the one authorization — the exact "an authorization for a different conflict is
refused, not silently reused" refusal (plan §4 M5) failing, even though `matchesConflict` itself was
correct for every input it was ever tested against in isolation (each of this milestone's own
pre-existing tests used conflicts with genuinely distinct ids).

**Why this is INPUT VALIDATION, not a logic bug in `matchesConflict` or a missing correlation
check, argued at the strength the report itself demands:** `lib/conflict/detected-conflict.ts`'s own
`deriveConflictId` (frozen at M3) mints every `ConflictId` DETERMINISTICALLY from `kind + resourceId
+ sorted, deduplicated agentIds` — two conflicts M3 itself ever produces from real claims/heartbeats
CANNOT collide; a collision requires two different logical facts to hash to the same string, which
`deriveConflictId`'s own construction rules out for its own output. But `arbitrate`'s signature
accepts `conflicts: readonly DetectedConflict[]` from ANY caller, not only from `detectConflicts`'s
own output — and, until this fix, trusted `conflict.id` verbatim, with no check that the ids
actually behave like ids (unique within the batch) at all. This is precisely the shape of
precondition this milestone already has a working, accepted precedent for: the
`conflicts.length === available.length === severities.length` check (Decision 7) fails closed on an
input shape violation that is fully checkable from data already in hand, before any ruling logic
runs, rather than trying to make the downstream logic robust to an input that never should have
been well-formed in the first place.

**Chosen fix — a canonical-form requirement, not correlation machinery:** `arbitrate` now also
throws if `conflicts.map((c) => String(c.id))` contains a duplicate, checked with one `Set` pass
immediately after the length precondition, before any conflict is ruled on. **This is the whole
fix.** `matchesConflict` itself is UNCHANGED.

**Alternative considered and explicitly rejected, per the coordinator's own instruction, and worth
recording why rather than only that it was rejected: teach `matchesConflict` (or a new check inside
`ruleOneConflict`) to also compare `resourceId`/`agentIds` between the authorization's target
conflict and the conflict currently being ruled on.** This would also have closed the reported
bypass, but was rejected because it is CORRELATION MACHINERY with its own edges, of the identical
shape this project has already paid for choosing over a canonical-form requirement more than once —
`.genesis/decisions/0001-contracts.md`'s own history (a hand-rolled scanner chasing an unenumerable
class of bypasses, five bypasses across five rounds, before the guarantee was RELOCATED to a
narrower, structurally-checkable property instead of extended again) is the direct precedent this
milestone is following, not reinventing. A `resourceId`/`agentIds`-comparison check would need its
own answer to questions a canonical-form requirement never has to ask at all: does a
`humanAuthorization` for a `write-write` conflict on `{agentA, agentB}` "correlate enough" to also
license a ruling on a DIFFERENT conflict that shares one of those two agents but not the other, or
shares the resource but names a third kind? Every one of those questions is a new edge a
correlation check would have to get right; a uniqueness precondition on the batch's own ids has none
of them, because it never asks what a correlation IS — it only asks that the caller's own claimed
identifiers behave like identifiers.

**Correcting an overclaim in this ADR's own first version, per the coordinator's explicit
instruction not to replace one overclaim with another:** the first version of this ADR's
Consequences section stated "the per-conflict authorization match... is unit-tested directly and
end-to-end." That was true only for the case this milestone had thought to test — two conflicts with
DISTINCT ids — and did not hold for two conflicts sharing an id, which is exactly the case that
turned out exploitable. The corrected claim, stated at its true strength: **`matchesConflict`'s own
string-equality check is unit-tested directly and is exactly what its name says — a comparison of
two `ConflictId` strings, nothing more.** The PROPERTY this milestone actually owes ("an
authorization for one conflict never licenses another") holds only once `arbitrate`'s OWN
precondition guarantees every conflict in a batch has a unique id — a fact this milestone now
enforces structurally (Decision 8, this section) and tests directly (`__tests__/
human-authorization.test.ts`'s "duplicate conflict id" describe block; `__tests__/
never-exceed-gate.test.ts`'s dedicated, deliberately-colliding-id sweep, below), not a fact
`matchesConflict` was ever positioned to guarantee by itself.

**The property test's own generator gap, found and fixed alongside the code:** `never-exceed-
gate.test.ts`'s original 300-scenario sweep derives every conflict's id from
`kind-resource-agents` (`buildScenario`), which makes an incidental collision between two generated
conflicts astronomically unlikely — so 300 passing scenarios were never evidence this axis was
handled correctly; they simply never exercised it. "A generator that cannot produce the failure is
not evidence of its absence" (the coordinator's own framing, kept verbatim rather than restated,
because restating it risked softening the point). Fixed by adding a SECOND, dedicated generator
(`buildCollidingScenario`) that forces two generated-but-otherwise-independent conflicts to share an
id on every one of 100 iterations, asserting `arbitrate` throws every time, plus a sanity test
confirming the forced pair really does differ in `kind`/`resourceId`/`agentIds` (so the sweep is
proven to be exercising a genuine collision, not a vacuously-identical pair) — the original
300-scenario sweep is UNCHANGED and continues to prove the ordinary, non-colliding property.

**Falsifiability of this specific fix, run for real:** the precondition was temporarily removed
(replaced with a comment); `npx vitest run lib/arbitrate` (38 tests) failed exactly **4** — the
reported bypass's own regression test, its no-authorization variant, the three-conflicts variant,
and the 100-scenario deliberately-colliding sweep — with the remaining 34 (including the ordinary,
non-colliding 300-scenario sweep, unaffected) staying green. Restored from a pre-edit backup;
`npm run typecheck` and `npm test` reconfirmed clean (26 files / 375 tests) before this revision was
committed.

## Falsifiability — the experiments actually run against this milestone's own code

**Gutting experiment 1 — always-observe** (`ruleOneConflict` replaced with an unconditional
`{ kind: "observe" }` ruling, ignoring every parameter): `npx vitest run lib/arbitrate` (32 tests)
failed exactly **18**, passed **14** — the 14 survivors are the tests that expect `observe` anyway
(the `benign`-severity fixture, the length-mismatch/empty-batch input-contract tests that never
reach `ruleOneConflict`, and the whole of `no-self-authorized-force.test.ts`, which scans source
text/types and is orthogonal to runtime behavior). Restored from a pre-edit backup; `npm run
typecheck` and `npm test` reconfirmed clean (26 files / 369 tests) before continuing.

**Gutting experiment 2 — always-escalate** (`ruleOneConflict` replaced with an unconditional
`warn` + `rule: "gate-ceiling"` + `escalationRecommended: true`): failed exactly **16**, passed
**16**. Restored; suite reconfirmed clean.

**Gutting experiment 3 — empty output** (`arbitrate` replaced with an unconditional `return []`,
after its own length-check): failed exactly **19**, passed **13**. Restored; suite reconfirmed
clean.

None of the three sabotages added a compensating fix anywhere else while gutted — each was the
single, minimal change named, restored verbatim afterward from an untouched backup copy, per this
account's own standing caution against a sabotage that quietly narrows its own blast radius.

**`no-self-authorized-force.test.ts`'s own comparison, sabotaged**
(`isHumanAuthorizationPropertyRead` replaced with an unconditional `return true`): failed exactly
**1 of 5** — the "EXPLOIT REGRESSION" test, the one that actually depends on the comparison telling
truth from fabrication. The remaining four (sanity, false-positive discipline, the disclosed-limit
test, and the real-`lib/arbitrate/**`-is-clean assertion) stayed green, because a scan that always
says "fine" still reports zero offenders against real, actually-clean source — confirming the
sabotage's blast radius is exactly the one test built to catch a real offender, not narrower or
wider. Restored; that file's own 5 tests and the full suite reconfirmed clean.

**The never-exceed-the-gate property, proven over 300 generated scenarios, not a handful of
fixtures** (`__tests__/never-exceed-gate.test.ts`): random conflicts (1–4 per scenario, random
kind/resource/agent-subset), random `available` sets (always including the real gate's own
`observe`/`warn` baseline — this milestone's documented precondition), random participants
(sometimes incomplete, sometimes disagreeing on `checkpointId`, to actually exercise the
degradation paths rather than only the happy path), and a randomly-placed-or-absent
`HumanAuthorization` (including, in a dedicated second property, one deliberately scoped to a
conflict OUTSIDE the batch entirely). For every ruling in every scenario: the selected rung is
either present in that ruling's OWN paired `available` set, or is `halt-forced` with a
verified-matching authorization for that SAME conflict — never borrowed from a different conflict
in the same batch, never invented. A companion sanity test confirms the 300-scenario sweep actually
touches every one of the five `ArbitrationRule` values and all six `ArbitrationRung` values at
least once, so the property's "always holds" result is not vacuously true over a narrow generator.

## Consequences

- Positive: the `ResourceClaimId`-identifies-a-claim gap `.genesis/decisions/0001-contracts.md`
  Decision 3 named, and the `CheckpointId` gap this milestone found while building (Decision 2),
  are both closed by one new, `lib/arbitrate`-owned type (`ArbitrationParticipant`) — with zero
  changes to `lib/contracts/**`, `lib/conflict/**`, or `lib/gate/**` (`git diff main -- lib/contracts
  lib/conflict lib/gate` confirmed empty).
- Positive: the never-exceed-the-gate property is enforced structurally (two visibly separate code
  paths in `realize`'s own `switch` — one filtered through `available`, one gated on a
  per-conflict-matched authorization and nothing else) AND proven over 300 generated scenarios, not
  a handful of fixtures.
- Positive (corrected after L4 VERIFY rejected this ADR's first, overclaiming version — see
  Decision 8): `matchesConflict`'s own string-equality comparison is unit-tested directly. The
  PROPERTY this milestone actually owes — an authorization for one conflict never licenses another —
  additionally depends on `arbitrate`'s own duplicate-conflict-id precondition (Decision 8), without
  which two conflicts sharing an id string defeat the property regardless of how correct
  `matchesConflict` itself is. Both halves are now tested directly: the distinct-id case
  (`__tests__/human-authorization.test.ts`'s "A cannot license B" case, and the property test's own
  "authorization outside the batch" sweep) and the duplicate-id precondition itself (that same
  file's "a batch with a duplicate conflict id is refused" cases, and
  `__tests__/never-exceed-gate.test.ts`'s dedicated, deliberately-colliding 100-scenario sweep,
  distinct from the ORIGINAL 300-scenario sweep, which — found and disclosed in Decision 8 — never
  exercised this axis at all because its generator derives ids from data that cannot incidentally
  collide).
- Positive: three gutting experiments (always-observe, always-escalate, empty-output) each isolated
  a large, non-trivial, and DIFFERENT blast radius (18, 16, and 19 of 32 tests respectively) with no
  compensating fix, and the structural scan's own comparison was independently confirmed
  load-bearing (1 of 5 tests, the exploit regression, precisely).
- Positive: two real, previously-unnamed plan defects were found and argued, not silently resolved:
  `severity`'s own batch-wide-scalar-vs.-per-conflict-array shape (Decision 3), and the "never
  exceed the gate" vs. "must produce `halt`/`forced`" apparent contradiction (Decision 4).
- Negative / cost: `arbitrate`'s signature now has five parameters against the plan's literal four,
  a larger surface departure than M3's or M4's own single-type substitutions — argued at length
  (Decisions 1–3) rather than presented as a one-line addition, per this milestone's own
  instructions.
- Negative / cost: `no-self-authorized-force.test.ts`'s own structural scan verifies TYPE IDENTITY,
  never DATA-FLOW PROVENANCE — a `HumanAuthorization`-typed value fabricated elsewhere in the same
  file and merely read from would pass undetected (disclosed, reproduced, and pinned by a real test,
  not silently accepted). The actual guarantee for `arbitrate.ts`'s own shipped code rests on this
  scan PLUS `assertValidHaltForced`'s runtime guard PLUS the fact that `buildForced` is this
  milestone's one, sole, directly-parameter-reading construction site — composed evidence, never
  claimed to be a single complete defense.
- Negative / cost: multi-agent conflicts where participants genuinely disagree on `checkpointId`
  cannot realize `pause`/`halt`/`checkpointed` at all — this milestone fails closed
  (`checkpoint-unrealizable`) rather than guess, a real, disclosed ceiling on what this design can
  do for a conflict with disagreeing self-reports, not a bug to quietly work around.
- Negative / cost: the "available is malformed and lacks even `observe`" fallback is the one named
  point where `arbitrate` selects a rung not present in its own caller-supplied `available` set —
  disclosed and tested, but worth a future reader's attention if `lib/gate/**`'s own baseline
  guarantee (`observe`/`warn` always present) is ever weakened.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
