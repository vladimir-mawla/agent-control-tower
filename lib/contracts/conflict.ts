/**
 * `Conflict` — closed 3-value enum naming the KIND of collision the tower
 * detected (plan §2):
 *
 *   - `"write-write"`        — two claims want exclusive/write on the same
 *                               resource.
 *   - `"write-read"`         — a reader holds data a live writer has
 *                               claimed.
 *   - `"undeclared-access"`  — a heartbeat shows an agent touched a
 *                               resource it never claimed. Plan §2 is
 *                               explicit this **refuses** to be treated as
 *                               any weaker than the other two: "a claim
 *                               invented after the fact cannot be
 *                               corroborated prospectively at all;
 *                               retroactive claims are not claims."
 *
 * SCOPE NOTE, READ BEFORE WIDENING THIS FILE: the plan's own §2 text
 * defines `Conflict` exactly this way — a bare closed enum, the same shape
 * as `Corroboration` and `ConflictSeverity` — not a record. Elsewhere,
 * though, the plan describes richer conflict *values*: `Intervention`'s
 * `halt`/`forced` variant (intervention.ts) carries a `conflictId:
 * ConflictId` binding an authorization to "this conflict specifically"
 * (plan §4, M1), and `.genesis/DONE.html`'s locked spec says a ruling must
 * always cite "the conflict id, the rule, and the evidence." Those both
 * require SOME conflict value to eventually carry an id (and presumably a
 * resource, the agents involved, etc.) — but the plan's M1 section names
 * no such record shape, and `detectConflicts` (M3, `lib/conflict/**`, the
 * function that actually produces `Conflict` values from real claims and
 * heartbeats) is explicitly out of this milestone's scope ("no engine
 * logic — M3 detects conflicts").
 *
 * This file deliberately does NOT pre-invent that richer shape. Guessing
 * now which fields a real, M3-produced conflict record needs (and getting
 * it wrong before `lib/conflict/**` exists to prove it right) would freeze
 * a wrong shape into `lib/contracts` for every later milestone to inherit
 * — worse than the honest gap of leaving it to M3, which is the milestone
 * that can actually test the answer against real `detectConflicts` output.
 * `ConflictId` (ids.ts) already exists as an opaque token for exactly this
 * reason: `Intervention` can reference "a conflict, by id" today without
 * `Conflict` itself needing to own an `id` field yet. See
 * `.genesis/decisions/0001-contracts.md` for the full reasoning, and this
 * milestone's PR/report for the same gap flagged explicitly rather than
 * silently resolved.
 *
 * No `assertNeverConflict` helper, for the same reason `Corroboration`
 * has none: no exhaustive switch over all three values exists yet in this
 * milestone.
 */
export type Conflict = "write-write" | "write-read" | "undeclared-access";

/** Every legal `Conflict`, for tests that need to enumerate the closed set. Not consumed by any production code in this milestone. */
export const ALL_CONFLICTS: readonly Conflict[] = ["write-write", "write-read", "undeclared-access"];
