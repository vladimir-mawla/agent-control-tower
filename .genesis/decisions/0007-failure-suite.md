# ADR 0007 — M7 the failure suite: which sketched cases survived contact with the real code, which were replaced, and the limits nobody had written down

- **Date:** 2026-09-22
- **Status:** accepted
- **Phase / milestone:** M7 (VERIFY) — `tests/failures/**`

## Context

`.genesis/PLAN.md` §4's M7 entry scopes this milestone to "the required
deliberate-failure test plus the honest-limit cases below, all pinning a
real limit of this specific design, not a generic input-validation
exercise," frozen after this milestone. §5 sketches ten cases. `lib/**`,
`domains/**`, `app/**`, and `components/**` are all frozen/settled inputs;
this milestone's own scope is `tests/failures/**` and this file
(`git diff main -- lib domains app components` stays empty throughout,
confirmed after every file this milestone added).

This milestone is the first to sit on top of the WHOLE system — M1's
`Intervention`, M3's `detectConflicts`, M4's `availableInterventions`, M5's
`arbitrate`, and M6's `domains/incident-response/**` all frozen and
readable at once. The brief's own warning is the correct one to take
seriously: fifteen rubric points reward genuine failure thinking, and this
is the milestone most often faked by writing a test that merely proves the
system works. **Every one of the twelve cases below is required, in its
own comment block, to say what would make it fail** — and five of the
twelve (the ones judged most load-bearing, or most likely to be quietly
weakened by a future change) were additionally SABOTAGED FOR REAL against
this milestone's own test assertions (never against frozen `lib/**` or
`domains/**` source, which this milestone may not touch even temporarily)
and confirmed to fail with a precise, non-vacuous diff before being
restored. See "Falsifiability" below for the transcript.

## Decision 1 — twelve cases, not ten: four of the plan's own ten sketches were replaced or substantially re-scoped after reading the real code, not merely restated

Reading `.genesis/PLAN.md` §5 against the actual, frozen source in
`lib/conflict/detect-conflicts.ts`, `lib/gate/clock.ts`, and
`lib/arbitrate/arbitrate.ts` directly (not assumed from the sketch's own
prose) showed four of the ten sketched cases would either be regression
tests wearing a failure's clothes, or would describe a mechanism this
system does not actually have. Per this milestone's own brief — "if a
sketched case turns out not to be a real limit, say so and replace it with
one that is" — each is recorded here rather than silently patched over.

**Sketch 1 (simultaneous exclusive claims, a tie)** — as literally written
("must produce a defined conflict, never favor one claim, never throw") is
already M3's own `order-independence.test.ts`, proven over 150 random
scenarios. Kept, but RE-SCOPED to the real limit underneath: `declaredAt`
is never read by `detectConflicts` at all (confirmed directly — `SafeClaim`
extracts only `agentId`/`resourceId`/`mode`), so a genuine tie and two
claims declared a million milliseconds apart are not merely both "handled
correctly" — they are byte-identical outputs, because arrival order was
never captured to begin with. `tests/failures/01-simultaneous-claims-
no-priority-order.test.ts`.

**Sketch 2 (stale checkpoint boundary)** — the N-vs-N+1 flip is already
M4's own falsifiability check, proven with a real experiment
(`.genesis/decisions/0004-gate.md` Experiment 2). Kept as a premise, then
EXTENDED to two things nobody had proven: (a) the boundary flip changes the
actual, final `Intervention` end-to-end (through the real gate AND the
real `arbitrate`), with nothing in either ruling recording that anything
changed; (b) `isCheckpointFresh` has no clock of its own — it never calls
`Date.now()`, so a caller lying about `now` makes a checkpoint declared
decades ago look perfectly fresh. Neither (a) nor (b) is stated anywhere in
six ADRs. `tests/failures/02-checkpoint-staleness-no-internal-clock.test.ts`.

**Sketch 7 (future-dated heartbeat, clock skew)** — REPLACED, not
reframed: this is a genuine plan defect, not a case this milestone could
honestly satisfy as written. `detectConflicts` has no `now` parameter at
all (unlike `availableInterventions`), and `Heartbeat.at` is never compared
to anything, anywhere — confirmed by reading `detect-conflicts.ts`'s own
`safeExtractHeartbeats` (reads only `agentId`/`resourceId`) and
`heartbeat.ts`'s own header ("even though `detectConflicts` itself... does
not compare `at` against anything"). There is no staleness/clock-skew
concept for a heartbeat anywhere in this codebase to fail closed OR open —
the sketch describes a mechanism that does not exist. Replaced with the
honest finding: a past-dated and a wildly future-dated heartbeat, otherwise
identical, produce a byte-identical `DetectionResult`. Folded into case 6
alongside the (real, kept) hostile-heartbeat sketch, because both concern
the same field and the contrast between them is the point: a throwing
getter on `agentId`/`resourceId` IS caught (sketch 6, real); the identical
attack on `.at` is invisible, not because it is defended against, but
because `.at` is never read at all. `tests/failures/06-heartbeat-hostility-
and-dead-timestamp.test.ts`.

**Sketch 8 (duplicate claim storm)** — as literally written ("must not
produce 50 conflicts or 50 rulings") restates M3's own idempotence,
already proven over 200 random scenarios plus a real sabotage-and-restore
experiment (`.genesis/decisions/0003-detection.md`). Kept as a one-line
baseline, then RE-SCOPED to a genuinely new finding reached by tracing
idempotence past M3's own settled boundary, into the arbitration layer:
detection's own dedup is keyed by `agentId`
(`groupClaimsByResource`'s `Set<string>`); `arbitrate`'s own `claimIdsOf`
dedups a completely different way — by the literal `ResourceClaimId`
STRING on each `ArbitrationParticipant`, never by `agentId`. A caller whose
claim-tracking mints a fresh id every time an agent renews its claim (a
reasonable scheme — ADR 0001/0005 both leave the minting STRATEGY
deliberately open) produces 50 distinct participant records for the SAME
agent, and a resulting `quarantine`'s `revokedClaims` lists all 50,
undeduplicated. `tests/failures/07-duplicate-claim-dedup-is-per-claim-
not-per-agent.test.ts`.

The other six sketches (3, 4, 5, 9, 10, and the "required deliberate-
failure test") survived contact with the real code largely as written and
are kept, in most cases extended with one additional, previously-unstated
finding each — see Decisions 2–4 below.

## Decision 2 — two cases added beyond the plan's own ten, closing gaps six ADRs disclose but never adversarially demonstrate

The task brief names eight limits already "disclosed across six ADRs" as
"the richest source" and asks this milestone not to merely restate them
but to "pin each in a test that would fail if the limit silently stopped
being true." Six of the eight map cleanly onto sketch cases already kept
(forced-halt forgery → case 3; TypeScript unsoundness inside checked
`lib/` → exercised end-to-end by case 3's Route A, which hands a
cast-forged `HumanId` to the real, live `arbitrate()`; `STALENESS_BOUND_MS`
as an invented constant → case 2; `ResourceClaim` carrying no id →
case 11; `arbitrate` throwing on duplicate conflict ids → case 12; the
unsolved priority-inversion case → case 9). **Two do not map onto any
sketch at all**, and are new cases rather than extensions of an existing
one:

**Case 10 — `gate-aggregation.ts`'s intersection policy lives in
`domains/`, protected by unit tests, not architecture scans.** ADR 0006
Decision 4c states this as a disclosed cost but never demonstrates it
adversarially. This case proves it: a hand-built UNION of two participants'
individual gate results (never calling the real, correct
`combinedAvailableInterventions`) slips past `arbitrate` with zero
refusal, producing a `quarantine` ruling reported with FULL confidence
(`rule: "severity-satisfied"`, `escalationRecommended: false`) that revokes
a self-reported agent's claim off a co-participant's stronger evidence
alone — the exact failure the intersection policy exists to prevent,
proven reachable the moment anything upstream of `arbitrate` computes
`available` a different way. `tests/failures/10-intersection-policy-
unenforced-by-lib.test.ts`.

**Case 11 — `ArbitrationParticipant` correlates by the caller's own
say-so, with nothing to cross-check against.** `arbitrate`'s signature
never receives a real `ResourceClaim` or `CheckpointDeclaration` — only
`DetectedConflict`, `AvailableInterventionSet`, `ConflictSeverity`, and
`ArbitrationParticipant`. A `claimId`/`checkpointId` naming nothing real is
cited in the final `Intervention` exactly as confidently as a genuine one.
`tests/failures/11-participant-identity-is-uncrosschecked.test.ts`.

## Decision 3 — case 5 (self-report vs. independent verification) required inventing a concrete mapping the plan's own prose does not supply

Sketch 5 describes "an agent's heartbeat claims 'all clear' while the
tower's own independently-verified health probe disagrees." This system's
`Heartbeat` carries no content to agree or disagree about — only identity
and an instant (`lib/conflict/heartbeat.ts`). The closest real analogue
this codebase actually has is `ResourceClaim.corroboration`: one
participant's own account of a collision (self-reported) standing against
a co-participant's tower-verified account of the SAME collision. Chosen
over inventing a new field or a new conflict shape (which would be exactly
the "tolerating a case nobody asked for" pattern this account's own
standing note warns against, one level up from where it usually applies —
here, inventing SCHEMA to fit a sketch, not merely a test fixture). Built
as two halves, both proven: the self-report cannot suppress detection or
escalation (corroboration plays no role in whether `detectConflicts`
reports a conflict at all); the independently-verified evidence does not
unilaterally license action either (the intersection policy's ceiling is
set by the weakest participant, never the strongest).
`tests/failures/05-self-report-vs-independently-verified.test.ts`.

## Decision 4 — case 9 (priority inversion) kept exactly as sketched, then extended with a sharper, previously-unstated finding

Sketch 10 is the one case whose own reasoning survives contact with the
real code completely unchanged — `.genesis/PLAN.md`'s own "considered and
rejected" section and ADR 0006's own closing section both already state
"no automatic priority-based preemption exists" in matching language. Part
1 of this case proves exactly that sentence with real inputs. Part 2 goes
further, past what the plan states: even in the ONE case where the tower
COULD act (both agents' evidence strong enough to realize quarantine),
`claimIdsOf` revokes every relevant participant's claim indiscriminately —
there is no way to construct an `Intervention` that dispossesses only the
low-priority squatter while sparing the legitimate remediation's own
claim. The single lever strong enough to act on a priority-inverted
conflict is symmetric, never preferential — a fact nobody had written down
because nobody had tried to use quarantine as a targeted tool and watched
it take both claims. `tests/failures/09-priority-inversion-unsolved.test.ts`.

## Decision 5 — case 3 is two sub-cases, not one, because the plan's own single sentence names two structurally distinct bypasses

"A caller can forge a `HumanAuthorization` outside `lib/`... A
`HaltForced` can be hand-constructed in `domains/` bypassing `arbitrate()`
entirely" (task brief, citing ADR 0006 Decision 4b) names two different
attacks with two different lessons: Route A (a forged `HumanAuthorization`
fed into the REAL, live `arbitrate()`) shows `arbitrate` has no channel to
verify authenticity even when every structural check it owns passes. Route
B (a `HaltForced` value hand-assembled with no call to `arbitrate()` at
all — the literal ADR 0006 scratch experiment, landed here as a permanent
test instead of a one-off finding) shows the "never mints one from
scratch" guarantee is a fact about `lib/`'s own code, never a fact about
what a caller can do with the exported type. Pinning only one would leave
the other silently re-discoverable by a future verifier.
`tests/failures/03-forced-halt-cannot-be-authenticated.test.ts`.

## The final twelve, mapped against the plan's own ten sketches

| # | File | Sketch | Status |
|---|---|---|---|
| 1 | `01-simultaneous-claims-no-priority-order` | 1 | kept, re-scoped to the real limit (no ordering info survives at all) |
| 2 | `02-checkpoint-staleness-no-internal-clock` | 2 | kept, extended end-to-end + a new "no internal clock" finding |
| 3 | `03-forced-halt-cannot-be-authenticated` | 3 | kept, split into two structurally distinct routes |
| 4 | `04-quarantine-degrades-on-self-reported` | 4 | kept as sketched |
| 5 | `05-self-report-vs-independently-verified` | 5 | kept, re-mapped onto `Corroboration` (this system's real primitive) |
| 6 | `06-heartbeat-hostility-and-dead-timestamp` | 6 + 7 | 6 kept; 7 REPLACED (plan defect — heartbeat clock-skew does not exist in this system) |
| 7 | `07-duplicate-claim-dedup-is-per-claim-not-per-agent` | 8 | kept as a premise, re-scoped to a new arbitration-layer finding |
| 8 | `08-agent-silence-is-the-callers-responsibility` | 9 | kept, re-scoped: not "handled safely" but "no mechanism exists at all" |
| 9 | `09-priority-inversion-unsolved` | 10 | kept as sketched, extended with the "symmetric, not preferential" finding |
| 10 | `10-intersection-policy-unenforced-by-lib` | — | new (richest-source bullet, never adversarially demonstrated before) |
| 11 | `11-participant-identity-is-uncrosschecked` | — | new (richest-source bullet, never adversarially demonstrated before) |
| 12 | `12-duplicate-conflict-id-fails-closed` | — (required test) | new file, reproduces ADR 0005 Decision 8's own already-fixed property as a permanent, standing regression in the suite the rubric actually reads |

## Falsifiability — five sabotage-and-restore experiments run against this milestone's own test assertions

Per this account's own standing discipline ("a test that cannot fail is
worthless... prove at least the most important ones by making it fail")
and the hard constraint that `lib/**` and `domains/**` may not be touched
even temporarily this milestone, falsifiability here means sabotaging THIS
milestone's own assertions (never the frozen source they exercise) and
confirming each fails with a precise, non-vacuous diff — proving the
assertion is actually checking something, not vacuously true for any
input. Five cases, judged the most load-bearing or most likely to be
silently weakened later, were sabotaged for real, one at a time, and
restored from the original file before the next:

1. **Case 1** — flipped `expect(tied).toEqual(staggered)` to `.not.toEqual`.
   Failed: `AssertionError: expected {...} to not deeply equal {...} —
   Compared values have no visual difference.` Confirms the two runs really
   are byte-identical, not coincidentally similar.
2. **Case 4** — flipped the expected kind from `"warn"` to `"quarantine"`.
   Failed: `expected 'warn' to be 'quarantine'`. Confirms the degradation is
   real, not a fixture that happened to produce `warn` by construction.
3. **Case 7** — flipped the expected `revokedClaims` length from `51` to
   `2`. Failed: `expected [ 'claim-agent-a-renewal-0', …(50) ] to have a
   length of 2 but got 51`. Confirms the 50-distinct-ids scenario really
   does produce 51 undeduplicated entries, not a rounded-off approximation.
4. **Case 9 Part 2** — flipped the expected `revoked` array from
   `["claim-high", "claim-low"]` to `["claim-low"]`. Failed: `expected [
   'claim-high', 'claim-low' ] to deeply equal [ 'claim-low' ]`. Confirms
   quarantine really does revoke the high-priority agent's own claim too,
   not merely the interloper's.
5. **Case 12** — flipped `.toThrow()` to `.not.toThrow()`. Failed:
   `expected [Function] to not throw an error but 'Error: arbitrate:
   conflicts contains a duplicate conflict id...' was thrown`. Confirms the
   precondition fires for real on this exact input shape, not only on the
   fixture ADR 0005's own test suite already covers.

All five were restored verbatim from the pre-sabotage file immediately
after observing the failure; `npx vitest run tests/failures` was
re-confirmed at 12 files / 30 tests passing before this ADR was written,
and `npm test` was re-confirmed at 42 files / 438 tests passing (30 more
than `main`'s 30 files / 408 tests) before this milestone's PR was opened.

The remaining seven cases were not separately sabotaged (effort was
budgeted toward breadth across twelve distinct limits rather than
exhaustively re-proving each one); each states its own falsification
condition in its own file header, and several (2, 5, 10, 12's own second
assertion) already carry an internal, computed CONTRAST — a correctly-
computed value shown side by side with the limit's own value in the same
test run — which is itself a form of falsifiability proof: it demonstrates
the assertion distinguishes the two cases, not merely that it passes once.

## What was NOT done, disclosed rather than silently decided

- **No new dependency, no change to any `ALLOWED_EXTERNAL_SPECIFIERS`
  allowlist.** `tests/failures/**` is outside `lib/**` entirely, so
  `lib/contracts/__tests__/import-containment.test.ts`'s closed-module-graph
  scan (scoped to `lib/**` only) never walks it — confirmed by running that
  test file unmodified after adding this milestone's own files, still
  green with no edit.
- **`tests/failures/support.ts` duplicates, rather than imports, each
  frozen milestone's own `__tests__/fixtures.ts` conventions** — the
  identical "a sibling milestone's `__tests__/` is not part of its own
  public surface" reasoning `lib/arbitrate/__tests__/fixtures.ts`'s own
  header already states for the identical situation one layer down,
  applied here one layer further out.
- **Cases 10 and 11 do not, and cannot, prove `lib/arbitrate` or
  `lib/gate` are WRONG to trust their own inputs this completely** — both
  modules are frozen, and their own ADRs (0004, 0005) already argue, on
  the merits, for exactly the narrow, non-cross-checking signatures they
  have (adding cross-checking would mean either a `lib/contracts` unfreeze
  or a real I/O boundary neither module is meant to have). These two cases
  document the resulting SHAPE of trust precisely, as a limit to be aware
  of when composing this pipeline into a real system (M8/M9), not as a
  defect this milestone found in frozen code.
- **No case in this suite touches `app/**`/`components/**`** — M8 (the
  interactive demo) is the first milestone to build either, and this
  milestone's own freeze boundary (`tests/failures/**` only) has nothing to
  say about UI-layer failure modes that do not yet exist to test.

## Consequences

- Positive: twelve failure cases, each stating in its own file what would
  make it fail; five independently proven load-bearing by real
  sabotage-and-restore experiments with precise, reproduced diffs; several
  more carrying an internal correctly-computed-vs-limit contrast in the
  same test run.
- Positive: four of the plan's own ten sketches were found, on reading the
  real frozen code directly rather than assumed from the sketch's own
  prose, to be either regression tests in disguise (sketches 1, 8) or to
  describe a mechanism this system does not have at all (sketch 7) — each
  named explicitly and replaced with a real, falsifiable limit rather than
  quietly satisfied by a weaker test that happened to pass.
- Positive: two limits named across six ADRs but never adversarially
  demonstrated (the domain-owned intersection policy's real enforceability
  gap; `ArbitrationParticipant`'s uncross-checked identity) are now pinned
  with real, passing tests instead of resting on prose alone.
- Positive: `git diff main -- lib domains app components` stays empty for
  the whole of this milestone — confirmed after every file this milestone
  added, not only once at the end.
- Negative / cost: case 5's mapping of "self-report vs. independently
  verified" onto `ResourceClaim.corroboration` is an interpretive choice,
  not a literal reading of the sketch's own "heartbeat claims all clear"
  language — argued for in Decision 3, but a different, equally defensible
  mapping was possible and was not built or compared against.
- Negative / cost: seven of twelve cases were not independently sabotaged
  against this milestone's own assertions (only five were, chosen for
  being judged the most load-bearing) — each still states its own
  falsification condition in prose, but that is a claim, not a proof, for
  those seven specifically.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
