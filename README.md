# Agent Control Tower

A control tower that decides what to do about an already-running agent it did not start, using only
what that agent chooses to report about itself.

Two or more autonomous agents can end up colliding over the same resource while already mid-flight.
Detecting the collision is easy — any diff over resource claims can do it. The hard problem this project
targets is refusing to grant an intervention more forceful than the offending agent's own corroborated,
checkpointed evidence can actually support, because "just halt it" is the move most likely to be
destructive when the tower is wrong about what that agent was mid-way through doing. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the pipeline stage by stage and
[`docs/THESIS.md`](docs/THESIS.md) for where this is going; `.genesis/PLAN.md` and
`.genesis/decisions/*.md` carry the full original plan and every milestone's own design record.

## Live

**https://agent-control-tower-nine.vercel.app** — deployed at M2 (deliberately early, not left to the
end). `GET /api/health` runs a real check against `lib/contracts` (not a bare liveness ping) and reports
the deployed commit SHA. Verified in this session:

```bash
curl -sf https://agent-control-tower-nine.vercel.app/api/health
# {"status":"ok","commit":"b7ce6648c0f4b866e3c34498ec063caa277151ba","checks":{"contracts":{"pass":true,...}}}
```

The same URL also serves the interactive demo (M8): inject a colliding claim on `checkout-service`,
watch the gate's permitted set and the arbitrated ruling update live, and see the project's own headline
property directly — refuse to force-halt on the tower's own evidence, force-halt once given a human
authorization scoped to that exact conflict, refuse again for one scoped to a different conflict. See
[`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md) for a beat-by-beat script verified against the deployed
page.

## The pipeline

```
ResourceClaim[] / Heartbeat[]  →  detectConflicts  →  availableInterventions  →  arbitrate  →  InterventionRuling[]
   lib/contracts                   lib/conflict          lib/gate                lib/arbitrate
```

`lib/contracts` → `lib/conflict` → `lib/gate` → `lib/arbitrate` → `domains/incident-response`, one
directional import chain, no cycle (checked directly — see `docs/ARCHITECTURE.md`'s own grep). Every
stage's refusals are documented there, each cited to a real, currently-passing test.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript, deployed to Vercel
- Vitest for tests, `lib/` kept framework-free (`environment: "node"`, no jsdom)
- Build uses the webpack bundler explicitly (`next dev --webpack`, `next build --webpack`) with
  `experimental.extensionAlias` set in `next.config.ts` — Turbopack (Next 16's default) cannot resolve
  the NodeNext-style `.js`-suffixed relative imports `lib/` uses; see the comment in `next.config.ts`.

## Running it

Every command below was run directly against this branch in the session that wrote this file, in this
order, from a clean tree:

```bash
npm ci               # never `npm install` — see the note below
npm run typecheck     # tsc against both tsconfig.lib.json and tsconfig.json — clean
npm test              # vitest — 46 test files, 466 tests, all passing
npm run build          # next build --webpack — clean production build
npm run lint            # eslint . — clean
npm run demo:incident    # the M6 scenario end to end, five conflicts, all five Intervention kinds
npm run dev               # local dev server, http://localhost:3000
```

**Always use `npm ci`, not `npm install`, to restore dependencies.** npm 11.5.1 has a documented bug
([npm/cli#4828](https://github.com/npm/cli/issues/4828)) where `install` against an existing lockfile can
silently drop the platform-specific `@rolldown/binding-*` package Vitest resolves through, and `npm test`
then fails with a bare "Cannot find native binding" that gives no hint the *install*, not the code, is at
fault. `npm ci` does not have this problem.

### Clean-clone check

```bash
cd "$(mktemp -d)" && git clone https://github.com/vladimir-mawla/agent-control-tower . && npm ci && npm run typecheck && npm test
```

Run in this session against `main` (which predates this milestone's own `docs/**`/`README.md`-only
branch — this check clones the M8 state, 8 of 9 milestones, not this PR's own diff): `npm ci` completed
clean, `npm run typecheck` passed against both `tsconfig.lib.json` and `tsconfig.json`, and `npm test`
reported **46 test files, 466 tests, all passing** — matching the counts above exactly, from a genuinely
empty directory, no credentials required anywhere in the process.

## Honest limits

Unsoftened, because the sections above already showed the parts that work. This project's own nine ADRs
(`.genesis/decisions/`) argue several of these at length and are worth reading directly — several were
found only after independent review rejected an earlier, over-claiming version of the same guarantee.

- **A caller outside `lib/` can forge a `HumanId` and pass it to `arbitrate` as part of a fabricated
  authorization, and `arbitrate` has no way to tell.** `lib/` never *mints* a `HumanId` or assembles a
  forced halt from scratch — M1 took five independent-review rounds to arrive at that specific,
  narrower, actually-enforceable claim, after two rounds each found a working bypass of an earlier,
  broader one. But nothing in this codebase can confirm `authorizedBy` names a real, consenting human;
  verifying that would require either a secret this pure `lib/` module should not hold, or a real
  authentication boundary this project does not build. `tests/failures/03` pins both routes: a forged
  authorization fed into the real, live `arbitrate()` (Route A), and a `HaltForced` value hand-assembled
  with no call to `arbitrate()` at all (Route B, `.genesis/decisions/0006-domain.md` Decision 4b).
- **Two residuals in the type system itself are structurally unclosable, not merely unclosed.**
  TypeScript's own unsoundness lets a value laundered through `any`, or a generic cast naming its target
  only as a type argument at the call site, reach a branded type with zero cast expression to scan for —
  confirmed to typecheck with zero diagnostics, disclosed with a real passing test
  (`lib/contracts/__tests__/human-id.test.ts`'s own "DISCLOSED LIMIT" block) rather than chased with a
  fifth round of scanner patches.
- **The gate's own type-level leak scanner (`lib/gate/__tests__/type-leak.test.ts`) is a best-effort
  recall layer, not a completeness proof — stated at that strength only after three rounds of
  independent review each found a real declaration position an earlier version missed** (annotation
  gating, then identifier gating, then a missed sibling field and two missed name kinds). The
  load-bearing guarantee for the human-authorized halt mode was never either scanner — it is
  `AvailableInterventionKind`'s own closed type definition, which has structurally no member for that
  mode, plus `availableInterventions`'s signature carrying no `Intervention`-typed parameter at all.
- **`STALENESS_BOUND_MS` (5 minutes) is an invented policy constant with no basis in the plan or any
  frozen contract** — some number has to exist for "fresher than a bound" to mean anything, and this
  project states plainly that it is not researched or derived from any real incident-response cadence.
  The same is true of `SEVERITY_MINIMUM_RUNG`'s own mapping in `lib/arbitrate/severity-ladder.ts`.
- **`gate-aggregation.ts`'s intersection policy — the rule that keeps `quarantine` honest across
  multiple agents' evidence — lives in `domains/`, protected only by ordinary unit tests, not by
  `lib/gate`'s architecture-scan-backed guarantees.** `lib/gate/available-interventions.ts` only ever
  evaluates one agent's one claim; combining several agents' evidence into one answer was never actually
  `lib/`'s job (`.genesis/decisions/0006-domain.md` Decision 2/4c). `tests/failures/10` proves this is
  reachable: a hand-built union of two participants' individual gate results slips past `arbitrate` with
  zero refusal.
- **The coverage check added to close that gap trusts its own parameters.** After a live, shipped defect
  (`combinedAvailableInterventions` never checked that its `evidence` covered every conflict
  participant — `.genesis/decisions/0008-incomplete-evidence.md`) was fixed by requiring the conflict's
  participant set as an explicit argument, a caller whose own upstream aggregation derives *both*
  arguments from the same incomplete source reproduces the identical original bug with no exception at
  all — pinned by `tests/failures/13`, not merely described.
- **`claimIdsOf` dedups by claim-id string, not by agent.** One agent re-declaring the same claim 50
  times under a claim-tracking scheme that mints a fresh id each time contributes 50 undeduplicated
  entries to a `quarantine`'s `revokedClaims` — `tests/failures/07`.
- **Priority inversion is unsolved, and the one lever strong enough to matter cannot be aimed.** No
  automatic priority-based preemption exists, by design (a `corrupting`-severity remediation cannot be
  handed a resource a low-priority agent still holds without a human). The sharper finding
  (`tests/failures/09`, Part 2): even when both agents' evidence is strong enough to realize
  `quarantine`, the resulting `Intervention` revokes *every* relevant participant's claim — there is no
  way to construct one that dispossesses only the interloper while sparing the legitimate agent.
  Quarantine is symmetric, never preferential, so it cannot be aimed manually either.
- **`Heartbeat.at` is collected and never read anywhere in this codebase.** The plan's own clock-skew
  case (a future-dated heartbeat failing closed to "most stale") describes a mechanism this system does
  not have — `detectConflicts` has no `now` parameter and never compares `.at` to anything.
  `tests/failures/06` proves a past-dated and a wildly future-dated heartbeat, otherwise identical,
  produce a byte-identical result — not because the attack is defended against, but because the field is
  never read.
- **`ArbitrationParticipant`'s `claimId`/`checkpointId` are the caller's own say-so, with nothing to
  cross-check against.** `arbitrate` never receives a real `ResourceClaim` or `CheckpointDeclaration` —
  a fabricated id naming nothing real is cited in the final ruling exactly as confidently as a genuine
  one (`tests/failures/11`).
- **The scan proving no module under `lib/arbitrate/**` assembles a forced halt from scratch checks type
  identity, never data-flow provenance.** A `HumanAuthorization`-typed value fabricated elsewhere in the
  same file and merely read from would pass undetected — disclosed and reproduced, not silently accepted
  (`lib/arbitrate/__tests__/no-self-authorized-force.test.ts`'s own "DISCLOSED LIMIT" case).
- **Detection deliberately ignores `ttl`, so a reported conflict may name a claim that has technically
  already expired** — staleness is the gate's question, not detection's, and detection was built to
  never need a clock at all (`.genesis/decisions/0003-detection.md` Decision 4).
- **An agent that stops heartbeating entirely is never distinguished from one still running.** Its last
  known claim is still treated as held — correctly, per the plan's own "silence is not evidence of
  safety" refusal — but nothing in this codebase ever marks a claim as timed-out or flags an agent as
  gone dark; a caller gets exactly the same `AvailableInterventionSet` for a claim one second old and one
  that has been silent for a week, as long as neither has hit `ttl`-adjacent staleness on a field the
  gate actually reads (`tests/failures/08`).
- **The interactive demo (M8) exposes live knobs over exactly one of the scenario's five conflicts**
  (`checkout-service`) — the other four are still genuinely detected and ruled on by `npm run
  demo:incident`, but are not interactively reachable from the deployed page
  (`.genesis/decisions/0009-demo.md` Decision 3).
- **No browser-automation test simulates an actual click on the deployed demo.** The component is tested
  by rendering it to static markup at a range of initial states, and separately by calling the same pure
  bridge function every click handler calls — the click-to-re-render path itself was checked by hand
  against the deployed URL (`docs/WALKTHROUGH.md`), not by an automated end-to-end test.
- **This document's own citations are only as good as this session's verification, not a guarantee
  against future drift.** Every count and test name above was checked against this repository directly
  while writing this milestone (`docs/NOTES.md` records the exact commands); if a later change renames a
  file or a test without updating this section, this section becomes the thing that's stale — nothing in
  this repository's own tooling currently checks that a doc file's claims still match the code.

## Status

M1–M8 are built, merged, and frozen (`git diff main -- lib domains app components` stays empty for this
milestone's own branch). M9 (this milestone) adds `docs/**` and this README; it does not touch any
frozen code path.
