# ADR 0002 — M2 deploy: what the health endpoint actually checks, and why nothing else changed

- **Date:** 2026-09-22
- **Status:** accepted
- **Phase / milestone:** M2 (DEPLOY) — `app/api/health/**`

## Context

`.genesis/PLAN.md` §4's M2 entry scopes this milestone to "a minimal Next.js app, a health endpoint
that runs a real check against M1's frozen contracts (not a bare liveness ping) — deployed, second,
not last," with two explicit refusals: never report `200` if the real contracts check fails (must
return `503`), and never fabricate a commit SHA when `VERCEL_GIT_COMMIT_SHA` is unset locally (falls
back to `"unknown (local dev)"`). No engine milestone (M3–M5) exists yet, and this milestone must not
touch `lib/contracts/**`, frozen after M1's five verification rounds (`.genesis/decisions/
0001-contracts.md`).

## Decision 1 — what "a real check against the contracts" means when only `lib/contracts` exists

`lib/contracts` (M1) is six closed types plus a small number of supporting files. Of everything
exported from `lib/contracts/index.ts`, exactly two functions have real, falsifiable runtime
branching logic to exercise:

- `assertValidHaltForced(value: HaltForced): HaltForcedResult` — checks that `authorizedBy` and
  `conflictId` are present, non-empty strings.
- `isNonEmptyArray<T>(value: readonly T[]): value is NonEmptyArray<T>` — checks `value.length > 0`.

Everything else in M1 (`Corroboration`, `Conflict`, `ConflictSeverity`) is a pure string-literal
union with no runtime behavior at all, and `assertNeverIntervention` never runs on a value TypeScript
itself considers reachable — there is nothing there for a health check to call. So
`app/api/health/route.ts`'s `runContractsCheck()` exercises the two functions that do have logic, each
in **both directions**: a correct input that must pass, and a corrupted input that must be caught —
matching the "structural discrimination, not merely no exception" discipline memory-ledger's own
`app/api/health/route.ts` (read directly before writing this one) uses for `effectiveConfidence`.
Four assertions:

1. `assertValidHaltForced` on a well-formed `halt`/`forced` value → `ok: true`.
2. `assertValidHaltForced` on a value that reached the `HaltForced` shape via an unsafe cast with
   `authorizedBy` dropped entirely → `ok: false`, `error.kind === "missing-authorized-by"`.
3. `isNonEmptyArray` on an empty array → `false`.
4. `isNonEmptyArray` on a one-element array → `true` (so assertion 3 is a real discrimination, not a
   vacuous "always false").

**What would make this report unhealthy:** any of the four flipping — concretely, if a future edit to
`assertValidHaltForced` stopped validating `authorizedBy` (e.g. checked only `conflictId`), assertion
2 would flip from `ok: false` to `ok: true` and the endpoint would report `503` on the next request,
without anyone needing to notice the gap by reading the diff. This was verified directly during this
milestone, without touching the frozen contracts file: forcing `runContractsCheck`'s own `pass`
computation to `false` at the route level (a scratch, uncommitted edit, reverted immediately) flipped
the live local endpoint from `200`/`{"status":"ok",...}` to `503`/`{"status":"degraded",...}`, proving
the fail-closed wiring in `GET` actually works rather than assuming it from reading the code.

**Alternative considered and rejected: a bare `{ ok: true }` liveness ping.** This is exactly the
"decorative" shape the plan's brief calls out by name. Rejected because it can never report `503` for
any reason — there is nothing in it that can fail — which fails the account-wide standing rule that "a
check that cannot fail is not a check."

**Alternative considered and rejected: waiting for M3's `detectConflicts` to have something more
"engine-like" to check.** Rejected because M2's own scope note is explicit that M3 does not exist yet
("no engine logic — M3 detects conflicts, M4 gates, M5 arbitrates") and the plan's M2 section commits
to shipping the health endpoint against whatever M1 actually built, not against a future milestone's
imagined surface. `lib/contracts` is genuinely enough to build a real, falsifiable check on — see
Decision 1 above — so there was no gap to wait out.

**Where the `HumanId` for the health check's own `halt`/`forced` fixture comes from:** via an `as
HumanId` cast, written in `app/api/health/route.ts` — outside `lib/contracts` entirely. This is not a
workaround; it is the documented, expected way any caller outside `lib/` must produce a `HumanId`,
since `lib/contracts` deliberately exports no minting function for it (`human-id.ts`'s own header:
"a genuine `HumanId` ... a signed-in operator's own session identity ... is deliberately undecided by
this milestone" — i.e., it is the app layer's job to supply one, not `lib/`'s). This health check
plays that caller role for its own self-test.

## Decision 2 — deliberately not widening the check past `lib/contracts`

This endpoint is pinned to what existed at M2 (`lib/contracts` only) and is not written to
"grow" automatically as M3 (`lib/conflict`), M4 (`lib/gate`), and M5 (`lib/arbitrate`) land. Widening
it at each future milestone would make it a second, drifting copy of that milestone's own test suite,
checked less rigorously and in a different place. If a later milestone wants its own engine exercised
on every request, that is a decision for that milestone's own PR to make and justify, not one this
ADR pre-commits to.

## Decision 3 — no `vercel.json`

Next.js's zero-config detection was sufficient, matching the plan's own precedent note ("decision-
engine and shadow-run both needed none"). The one non-default build setting this project needs —
`next build --webpack` instead of Turbopack, because Turbopack cannot resolve `lib/`'s NodeNext-style
`.js`-suffixed relative imports (see `next.config.ts`'s own header) — is already expressed in
`package.json`'s `build` script, which Vercel's zero-config detection reads and runs directly; no
`vercel.json` override was needed to make the deployed build match the local one. Confirmed directly
against the deployed build log, not assumed — see this milestone's PR report for the exact deploy
output naming `next build --webpack`.

## Decision 4 — commit SHA source

`process.env.VERCEL_GIT_COMMIT_SHA`, set by Vercel on every deployment, with a fallback of
`"unknown (local dev)"` when unset (matching memory-ledger's own M2 precedent, read directly before
writing this). No other source was considered: it is the one value Vercel itself guarantees names the
exact commit being served, and fabricating one locally (e.g. from a local `git rev-parse`) would risk
the local value silently disagreeing with what is actually deployed.

## What this milestone leaves open, honestly

- `lib/contracts` has no consumer yet other than this health check and its own test suite — M3's
  `lib/conflict` is the first real engine layer, and this ADR makes no claim about what that
  milestone's own health/observability surface (if any) should look like.
- The health check's coverage is real but narrow: two functions, four assertions. It proves those two
  functions haven't regressed in the deployed process; it says nothing about `lib/contracts`' many
  purely-typed guarantees (e.g. `halt`/`forced`'s compile-time field requirements), which have no
  runtime behavior a health check could observe in the first place and are instead proven by
  `npm run typecheck` and `lib/contracts/__tests__/intervention.test.ts`'s `@ts-expect-error` cases.
