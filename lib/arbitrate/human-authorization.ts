import type { ConflictId } from "../contracts/ids.js";
import type { HumanId } from "../contracts/human-id.js";

/**
 * `HumanAuthorization` — NOT one of `lib/contracts/**`'s six frozen types.
 * `.genesis/PLAN.md` §4 M5 names it in `arbitrate`'s own literal signature
 * (`humanAuthorization?: HumanAuthorization`) but never defines its shape
 * anywhere in `lib/contracts/**` — the identical "the plan names a type it
 * never fixes" gap `.genesis/decisions/0003-detection.md` Decision 1 found
 * for `Heartbeat`, resolved here the same way: owned by the milestone that
 * first needs it (`lib/arbitrate/**`), not smuggled into frozen
 * `lib/contracts/**`.
 *
 * SHAPE, AND WHY IT STOPS AT EXACTLY THESE TWO FIELDS: `Intervention`'s
 * `halt`/`forced` variant (`lib/contracts/intervention.ts`) needs exactly
 * two fields to exist — `authorizedBy: HumanId` and `conflictId: ConflictId`
 * — and this project's own central design commitment
 * (`.genesis/decisions/0001-contracts.md` Decision 2, restated in
 * `intervention.ts`'s own header) is that `arbitrate` may only ever COPY
 * these two fields from a value its own caller handed in, never mint or
 * assemble them itself. `HumanAuthorization` is that value: the caller's
 * evidence that a specific human has signed off on a specific conflict.
 * No other field is added speculatively (a timestamp, a reason string) —
 * nothing in plan §4 M5's own "what it refuses" list needs one, and this
 * account's own standing note (`speculative-flexibility-costs-rounds.md`)
 * already argues directly against tolerating a field nobody has asked for
 * yet.
 */
export interface HumanAuthorization {
  readonly authorizedBy: HumanId;
  readonly conflictId: ConflictId;
}

/**
 * The per-conflict matching check plan §4 M5's own "what it refuses" list
 * names verbatim: "to produce `halt`/`forced` without a `humanAuthorization`
 * whose `conflictId` matches the specific conflict being ruled on (a valid
 * authorization for a different conflict is refused, not silently
 * reused)."
 *
 * Deliberately a type GUARD (`auth is HumanAuthorization`), not a bare
 * `boolean` — this is what lets `arbitrate.ts`'s own call site narrow
 * `humanAuthorization` (typed `HumanAuthorization | undefined`) to a
 * definite `HumanAuthorization` at every point it is actually read from,
 * without a second, redundant `undefined` check immediately afterward.
 *
 * WHAT THIS DOES NOT, AND CANNOT, CHECK — the identical honest limit
 * `lib/contracts/intervention.ts`'s `assertValidHaltForced` already states
 * for the frozen `HaltForced` shape, restated here for this file's own,
 * narrower job: this function confirms the STRING VALUES line up
 * (`auth.conflictId === conflictId`); it cannot confirm `authorizedBy`
 * names a real, consenting human, or that `conflictId` was ever a
 * genuinely-detected conflict at all. Verifying either fact for real is
 * out of scope for this pure, I/O-free `lib/` (`.genesis/PLAN.md`'s own
 * "no real I/O in lib" discipline) — see `arbitrate.ts`'s own header for
 * where this project's actual safety claim for `halt`/`forced` rests.
 */
export function matchesConflict(
  auth: HumanAuthorization | undefined,
  conflictId: ConflictId,
): auth is HumanAuthorization {
  return auth !== undefined && auth.conflictId === conflictId;
}
