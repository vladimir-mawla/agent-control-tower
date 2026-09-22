# Architecture: claims and heartbeats → conflicts → the gate → arbitration → the ruling

This is a snapshot, not a file tour — each `lib/**` package already documents its own shape in its own
header comments, and repeating that here would just be a worse copy. What earns this document its place
is the other half of the story: **at each stage, what does the engine refuse to do, and why.** Every
refusal named below is backed by a real, currently-passing test — file and test name, quoted verbatim
from the source, not paraphrased — inside the 46-file, 466-test suite `npm test` runs today (confirmed
by running it fresh in this session: `Test Files 46 passed (46)`, `Tests 466 passed (466)`). Anything
this document could not trace to an actual assertion was cut rather than asserted from memory of the
design.

**Import direction, checked, not assumed** (`grep -rn '^import' <package>/*.ts`, non-test files, run
directly against this tree): `lib/conflict/*.ts` resolves only to `lib/contracts/*.js`; `lib/gate/*.ts`
resolves only to `lib/contracts/*.js` and its own `./clock.js`; `lib/arbitrate/*.ts` resolves only to
`lib/contracts/*.js`, `lib/conflict/*.js`, `lib/gate/*.js`, and its own sibling files;
`domains/incident-response/*.ts` resolves to `lib/contracts`, `lib/conflict`, `lib/gate`, and
`lib/arbitrate` via each package's own `index.ts`. One direction, no cycle — the identical shape
`lib/contracts/__tests__/import-containment.test.ts` enforces structurally for everything under `lib/`
itself (every import resolves inside `lib/` or to an explicit external allowlist).

```
   INPUTS                  DETECTION              THE GATE                ARBITRATION            THE RULING
lib/contracts +         lib/conflict           lib/gate                lib/arbitrate          lib/arbitrate/
lib/conflict/            ────────────           ────────                ─────────────          intervention-
 heartbeat.ts                                                                                    ruling.ts
──────────────                                                                                  ─────────────
ResourceClaim[]   →   detectConflicts()  →   availableInterventions  →   arbitrate()      →   InterventionRuling[]
Heartbeat[]           pure, order-           (agent, claim,              conflicts[] +          conflictId +
CheckpointDecl.        independent,          checkpoint, now)            available[] +          Intervention +
   │                   idempotent               │                       severities[] +          rule (closed
   ▼                      │                     ▼                        participants +          vocabulary) +
a real value,             ▼                 Set<AvailableInter-          humanAuthorization?      evidence
or a typed         DetectionResult:         ventionKind> — never             │                       │
DISCLOSED LIMIT     ok:true, conflicts       a slot for the                  ▼                       ▼
(never a crash)     or ok:false, error       human-authorized          weakest available-      always cites
                                              halt mode                and-realizable rung       the conflict,
                                                                        meeting severity's        never a bare
                                                                        floor — or the             score or a
                                                                        separate, human-           free-text
                                                                        gated halt/forced           reason
                                                                        lane, never fed by
                                                                        `available` at all
```

One honest wrinkle in the diagram above, named rather than smoothed over: `halt`/`forced` is drawn
leaving ARBITRATION on a path that never touches THE GATE's own `available` set at all. That is not a
simplification — it is the literal shape `arbitrate.ts`'s own selection code takes (Stage 4, below), and
drawing it as if it flowed through the gate the way the other four kinds do would assert an import/data
path that does not exist.

---

## Stage 1 — Inputs (`lib/contracts/**`, plus `lib/conflict/heartbeat.ts`)

**Job:** turn a claim, a heartbeat, and a checkpoint declaration into typed values under a closed
vocabulary, and make the single highest-risk `Intervention` variant — a human-forced halt —
uncompilable without an authorization already in hand.

**What it refuses, and why:**

- **Refuses to let `ResourceClaim.mode` or `Corroboration` take a free-text value.** Both are closed,
  3-value string enums, not a lock description a caller can spell however it likes.
  *Tests:* `lib/contracts/__tests__/resource-claim.test.ts` — `"ResourceClaim.mode is a closed 3-value
  enum, never a free-text lock description"` (`"accepts exactly the three named modes"`,
  `"TYPE-LEVEL: a free-text mode does not compile"`); `lib/contracts/__tests__/corroboration.test.ts` —
  `"TYPE-LEVEL: an invented fourth value does not compile"`.
- **Refuses to compile a `halt`/`forced` literal missing `authorizedBy` or `conflictId`, a `pause`/
  `halt`-`checkpointed` literal missing `checkpointId`, or a `quarantine` literal with an empty
  `revokedClaims`.** All three are type errors, not runtime checks — `revokedClaims` is a
  `NonEmptyArray<ResourceClaimId>` tuple type, so `[]` is not assignable to it at all.
  *Tests:* `lib/contracts/__tests__/intervention.test.ts` — `"TYPE-LEVEL: halt/forced missing
  authorizedBy does not compile"`, `"TYPE-LEVEL: halt/forced missing both authorizedBy and conflictId
  does not compile"`, `"TYPE-LEVEL: pause missing checkpointId does not compile"`, `"TYPE-LEVEL: an empty
  revokedClaims array does not compile"`, `"TYPE-LEVEL: revokedClaims cannot be a plain possibly-empty
  ResourceClaimId[] either"`.
- **Refuses to let its own exhaustiveness guard be decorative.** `assertNeverIntervention` was proven
  live, not merely present, by actually deleting a handled case from a stand-in union during development
  and watching `npm run typecheck` fail with `TS2345` at the exact predicted line, then restoring it.
  *Test:* `intervention.test.ts` — `"the real Intervention union is exhaustively matched by
  assertNeverIntervention today, for all five real kinds"`.
- **Refuses to let a caller mint a `HumanId` via an ordinary, visibly-named cast anywhere in `lib/`'s own
  non-test source** — enforced by a symbol-identity scan built on the real TypeScript checker (not a text
  grep), which follows an aliased import or a re-export chain back to `HumanId`'s own declaration rather
  than trusting the name written at the call site.
  *Tests:* `lib/contracts/__tests__/human-id.test.ts` — `"no cast resolving to HumanId's own symbol
  appears outside a *.test.ts file"`, and its `"EXPLOIT REGRESSION"` block (an aliased import, a re-export
  chain, a parenthesized cast target, all confirmed caught).
- **Refuses (via a separate, runtime guard) a `HaltForced` value that reached that shape through an
  unsafe cast with a field dropped or blanked** — `assertValidHaltForced` checks `authorizedBy` and
  `conflictId` are both present, non-empty strings, independent of whatever the type checker already
  enforced at compile time.
  *Tests:* `intervention.test.ts` — `"rejects a value that reached the HaltForced shape via an unsafe
  cast with authorizedBy missing entirely"`, `"rejects a value missing conflictId even when authorizedBy
  is present"`.
- **DISCLOSED LIMIT, pinned rather than hidden:** neither the checker-based scan above nor
  `assertValidHaltForced` can catch a value laundered through `any`, or a generic helper cast naming its
  target only as a type argument at the call site — both typecheck with zero diagnostics and are
  structurally invisible to a scan built on cast-expression syntax. *Test:* `human-id.test.ts`'s own
  `"DISCLOSED LIMIT (not a check)"` block — `"[route A] a value laundered through any mints a HumanId
  with no cast expression at all — confirmed NOT caught"`, `"[route B] a generic helper cast..."`. This is
  the residual `README.md`'s Honest limits section states plainly: it is a property of what TypeScript is
  willing to check at all, not a gap this project has left unpatched.

## Stage 2 — Detection (`lib/conflict/**`, `detectConflicts`)

**Job:** `detectConflicts(claims, heartbeats): DetectionResult` — pure, order-independent, idempotent,
no gating, no arbitration.

**What it refuses, and why:**

- **Refuses to let claim/heartbeat array order affect the result.** Proven over an exhaustive
  permutation check on fixed scenarios (24 orderings of a 4-claim scenario; 6 orderings of 3 heartbeats)
  and a property-based sweep of 150 randomly generated scenarios × 5 shuffles each.
  *Tests:* `lib/conflict/__tests__/order-independence.test.ts` — `"every one of the 4! = 24 orderings of
  a 4-claim, 2-resource scenario... produces the identical result"`, `"a SIMULTANEOUS tie... is
  order-independent too (failure-suite case 1...)"`, and the `scenario seed=...` property sweep.
- **Refuses to treat an agent re-declaring the identical claim as a new conflict, or a repetition storm
  as inflating the result.** The mechanism is structural (a `Set<string>` keyed by `agentId` inside
  `groupClaimsByResource`), not a dedup pass bolted on afterward — confirmed by a real sabotage
  experiment (`Set` replaced with a plain array) that broke exactly three tests with precise diffs, then
  was restored.
  *Tests:* `lib/conflict/__tests__/detect-conflicts.test.ts` — `"the SAME agent holding two different
  (non-identical) write claims on one resource is not write-write against itself"`, `"an agent
  re-declaring the identical claim many times does not multiply the conflict it participates in"`;
  `lib/conflict/__tests__/idempotence.test.ts` — `"50 identical exclusive claims from the same agent,
  plus one real second claimant, is still exactly one write-write conflict"`, `"holds across 200 randomly
  generated scenarios, not just one hand-picked one"`.
- **Refuses to crash on a hostile claims or heartbeats array.** A throwing getter or a `Proxy` on either
  input becomes a typed, discriminated `DetectionResult` failure, never an uncaught exception — and
  claims are validated before heartbeats, so a caller can tell which input was the problem.
  *Tests:* `lib/conflict/__tests__/hostile-input.test.ts` — `"a Proxy claims array that throws on every
  property access returns a typed hostile-claims-input failure, not an uncaught exception"`, `"when BOTH
  inputs are hostile, the reported failure names the claims side (claims are validated first)"`.
- **Refuses to treat `undeclared-access` as weaker than a declared collision.** A heartbeat naming a
  resource the agent never claimed is its own conflict kind, not folded into or ranked below
  `write-write`/`write-read`.
  *Test:* `detect-conflicts.test.ts` — `"a heartbeat naming a resource the agent never claimed at all is
  undeclared-access, refusing to treat it as weaker than the other two kinds"`.
- **Refuses to guess when two claims' timestamps disagree — by never reading a timestamp at all.**
  `declaredAt` is not read anywhere in `detect-conflicts.ts`; the order-independence sweep above
  randomizes it independently of every other field specifically to make that claim falsifiable. The same
  applies to `ttl` and `corroboration` — both are questions for later stages (staleness is the gate's job;
  quarantine-eligibility is arbitration's), not for detection to pre-filter on.
  *Consequence, inherited deliberately by the gate:* a reported conflict may name a claim that has
  technically expired by `ttl` — detection does not filter it out before the gate ever sees it.

## Stage 3 — The gate (`lib/gate/**`, `availableInterventions`)

**Job:** `availableInterventions(agent, claim, checkpoint, now): Set<AvailableInterventionKind>` —
computed from `Corroboration` and checkpoint freshness alone, for exactly one agent's one claim.

**What it refuses, and why:**

- **Refuses to offer `quarantine` when the claim's corroboration is `self-reported`.**
  *Test:* `lib/gate/__tests__/available-interventions.test.ts` — `"refuses quarantine when the claim's
  corroboration is self-reported (plan §2, verbatim)"`.
- **Refuses to offer `pause`/`halt-checkpointed` when the checkpoint is unreachable, or stale beyond
  `STALENESS_BOUND_MS` (5 minutes — an invented, disclosed policy constant with no basis in the plan or
  any frozen contract).** The flip happens at exactly the configured bound, not near it (an N-vs-N+1
  test), and a future-dated `declaredAt` (clock skew) fails closed to stale, never to "most fresh."
  *Tests:* `lib/gate/__tests__/clock.test.ts` — `"elapsed time exactly equal to STALENESS_BOUND_MS is
  still fresh"`, `"elapsed time one millisecond past STALENESS_BOUND_MS is stale"`, `"a future-dated
  checkpoint... fails closed to stale, never to 'most fresh'"`; `available-interventions.test.ts` —
  `"both are available at exactly the staleness boundary"`.
- **Refuses to let a claim belonging to a different agent leak anything beyond the `observe`/`warn`
  baseline.** `claim.agentId` is compared against the `agent` parameter; a mismatch fails closed to the
  weakest defensible answer rather than guessing which identity is authoritative. This is a consistency
  check on two overlapping identity fields the signature already carries, not a third gating axis —
  confirmed load-bearing by independently removing the check and watching exactly 2 tests fail.
  *Test:* `available-interventions.test.ts` — `"does not leak pause/halt-checkpointed/quarantine when the
  claim's own agentId doesn't match the agent parameter, even if every other condition is maximally
  permissive"`.
- **Refuses to include the human-authorized halt mode in its output at all.** `AvailableInterventionKind`
  is `Exclude<Intervention["kind"], "halt"> | "halt-checkpointed"` — there is no member, field, or return
  path that could name it, and the function's own signature carries no `Intervention`-typed parameter for
  such a value to flow through in the first place.
  *Tests (type level):* `"assigning that mode's own string literal to AvailableInterventionKind does not
  compile"`, `"constructing a Set typed as AvailableInterventionSet with that mode's own literal requires
  an explicit, visible cast"`. *Tests (source scan):* `lib/gate/__tests__/architecture.test.ts` —
  `"the literal substring 'forced' (case-insensitive) never appears anywhere in lib/gate/**'s non-test
  source"` (catches the literal spelled directly); `lib/gate/__tests__/type-leak.test.ts` (27 tests,
  confirmed by running the file directly) — a checker-based, **best-effort recall** layer over type-level
  indirection (a named type alias, an inferred return type, a computed property, a private field), stated
  at that strength after three rounds of independent review each found a real declaration position an
  earlier version missed. Both scans disclose, with a real passing test rather than silence, the one
  residual neither catches: a generic-helper cast naming its target only as a type argument at its own
  call site.
- **Limit, disclosed rather than smoothed over: this stage evaluates exactly one agent's one claim.**
  Combining several participants' evidence into a single answer for a real, multi-agent conflict is not
  built here — it lives in `domains/incident-response/gate-aggregation.ts`, outside `lib/gate/**`
  entirely and outside every architecture scan this stage carries. See README's Honest limits for why
  that placement is a real, disclosed cost, not an oversight.

## Stage 4 — Arbitration (`lib/arbitrate/**`, `arbitrate`)

**Job:** `arbitrate(conflicts, available, severities, participants, humanAuthorization?):
InterventionRuling[]` — per conflict, select the weakest available-and-realizable rung that still meets
severity's floor, never a stronger one merely because it happens to be on offer.

**What it refuses, and why:**

- **Refuses to select a kind the paired `available` set did not contain.** Enforced structurally (every
  non-forced candidate is drawn by intersecting the ranked rung list with the caller's own `available`
  set) and proven over 300 generated scenarios, not a handful of fixtures.
  *Tests:* `lib/arbitrate/__tests__/never-exceed-gate.test.ts` — `"every ruling's selected rung is either
  present in its own conflict's paired available set, or is the separately-gated, per-conflict-matched
  halt/forced escalation"`; `lib/arbitrate/__tests__/arbitrate.test.ts` — `"available = {observe} only:
  never selects warn/pause/quarantine even under corrupting severity"`.
- **Refuses to overshoot severity's floor merely because a stronger tool is available.** Proportionality:
  the weakest sufficient rung wins, not the strongest available one.
  *Test:* `arbitrate.test.ts` — `"contained severity with pause and quarantine both available+realizable
  picks pause (the weaker one that already meets the floor), not quarantine"`.
- **Refuses to guess a `checkpointId` (or a set of `claimIds`) when a conflict's participants disagree,
  or none supplied one at all** — degrades to the next weaker realizable rung rather than fabricate a
  pick.
  *Tests:* `arbitrate.test.ts` — `"pause available but participants disagree on checkpointId: falls back
  rather than guessing which one is right"`, `"pause available but no participant declared any checkpoint
  at all: falls back"`.
- **Refuses to claim full remediation when the strongest available option is still weaker than severity
  demands.** The ruling returns that strongest option **and** a distinct `escalationRecommended: true`,
  never a `warn` that reads as "handled."
  *Test:* `arbitrate.test.ts` — `"corrupting severity where the gate permits only observe/warn returns
  warn, not a fabricated quarantine, plus escalationRecommended: true"`.
- **Refuses to let severity alone reach the human-authorized halt mode.** That mode is a structurally
  separate lane the gate was never in a position to grant or withhold — its sole gating condition is a
  `HumanAuthorization` whose `conflictId` matches the specific conflict being ruled on.
  *Test:* `arbitrate.test.ts` — `"corrupting severity, gate permits only warn, but a matching
  HumanAuthorization for THIS conflict is supplied: selects halt/forced instead of merely recommending
  escalation"`.
- **Refuses to let an authorization for one conflict license a different one that merely shares its id
  string.** This was a real, shipped defect, found by independent review and fixed here as an explicit,
  fail-closed precondition (every conflict id in a batch must be unique) rather than by teaching the
  matcher new correlation logic.
  *Tests:* `lib/arbitrate/__tests__/human-authorization.test.ts` — `"REGRESSION: two genuinely different
  conflicts sharing one ConflictId string used to both fire halt/forced off a single authorization — now
  refused before either is ruled on"`; `never-exceed-gate.test.ts`'s dedicated 100-scenario
  deliberately-colliding sweep — `"100 deliberately-colliding generated scenarios are ALL refused before
  any ruling is produced"`.
- **Disclosed limit:** the scan proving no module under `lib/arbitrate/**` assembles a forced halt from
  scratch checks *type identity* — is this value `HumanAuthorization`-typed — never *data-flow
  provenance*, whether it actually originated from the enclosing function's own parameter.
  *Test:* `lib/arbitrate/__tests__/no-self-authorized-force.test.ts` — its own `"DISCLOSED LIMIT (not a
  check)"` case, confirmed load-bearing by sabotage (1 of 5 tests in that file fails when the comparison
  is gutted).

## Stage 5 — The ruling (`lib/arbitrate/intervention-ruling.ts`)

**Job:** the one thing every prior stage's work is *for* — a value that always cites the conflict, the
rule, and the evidence, per `.genesis/DONE.html`'s own locked spec ("always citing the conflict id, the
rule, and the evidence").

**What it refuses, and why:**

- **Refuses to explain "why" in free text.** `ArbitrationRule` is a closed, five-value vocabulary
  (`severity-satisfied`, `gate-ceiling`, `checkpoint-unrealizable`, `quarantine-unrealizable`,
  `human-forced-escalation`) — a reason a reviewer can enumerate and dispute, never a sentence to
  interpret.
  *Test:* `arbitrate.test.ts` — `"every ruling names its own conflict's id, a closed-vocabulary rule, and
  structured evidence"`.
- **Refuses to omit what the gate actually permitted, or the floor a ruling was measured against.**
  `ArbitrationEvidence` carries `availableKinds` (before realizability filtering), `requiredMinimumRung`,
  `selectedRung`, and `humanAuthorizationMatched` as data, not narrative — a reviewer or a test can
  compare a ruling against its own stated inputs mechanically.
  *Source:* `lib/arbitrate/intervention-ruling.ts` (read directly; every field above is documented and
  used by `arbitrate.ts`'s own `ruleOneConflict`, exercised by the tests cited in Stage 4).
- **Refuses to claim a human authorization was *used* merely because one was present and matched.**
  `humanAuthorizationMatched: true` records that a per-conflict-matched authorization existed; whether it
  was actually the deciding factor is `rule`'s job (`"human-forced-escalation"` only), kept as two
  separate fields rather than one that could be misread either way.

---

See [`THESIS.md`](THESIS.md) for where this is going, [`NOTES.md`](NOTES.md) for how it was built and
verified milestone by milestone, and the [README](../README.md) for the honest limits this pipeline does
**not** close — including several nobody had written down before this milestone.

**A note on this document's own model, decided on the merits.** `~/Desktop/shadow-run/docs/ARCHITECTURE.md`
(326 lines, `main` at `8c7ecd8`) and `~/Desktop/decision-engine/docs/ARCHITECTURE.md` share the same base
shape — a snapshot rather than a file tour, per-stage "Job" + "What it refuses, and why" bullets cited to
real tests, a named limit disclosed inline where it belongs rather than deferred wholesale to a separate
section. The one structural choice that actually distinguishes them is the one that matters here:
shadow-run's own diagram opens with an explicit caveat that its stage order is a **runtime call sequence,
not an import chain** — `lib/simulate`, `lib/reconcile`, and `lib/rollback` are independent siblings at
the type level, each importing only `lib/contracts`, sequenced solely by domain/orchestration code that
calls all three. That caveat is the right choice *for shadow-run*, because it is true there and false to
omit. It is not this codebase's shape: `lib/conflict` → `lib/gate` → `lib/arbitrate` genuinely is a
layered import chain (the grep at the top of this document proves it), the identical shape
`decision-engine`'s own `lib/contracts → lib/signals → lib/decide → lib/audit` diagram documents. This
document follows `decision-engine`'s structure — stating the import chain directly as a diagram, rather
than shadow-run's own stage-order-is-not-an-import-chain caveat — because that is the one true of what
this codebase actually is, not because either sibling document was thought unavailable.
