/**
 * `ConflictSeverity` — closed 3-value enum, deliberately NOT a 0–1 score
 * (plan §2): `"benign" | "contained" | "corrupting"`.
 *
 * Rejected alternative, named directly in the plan: a bare severity float.
 * agent-trust-layer's own thesis (read while writing `.genesis/PLAN.md`)
 * argues a bare score is unappealable — "nobody can name the evidence or
 * say what would change it" — and this project takes that argument at
 * face value rather than rebuilding a score under a different name. A
 * named severity is something a human reviewing a ruling can dispute
 * ("why `corrupting` and not `contained`?") in a way "0.73" is not.
 *
 * Each severity is computed from the conflicting resource's declared blast
 * radius and the conflict kind (M5's job, `lib/arbitrate/**`, unbuilt) —
 * never asserted directly by an agent about itself: an agent doesn't get
 * to declare its own collision harmless. This file only fixes the three
 * names; nothing in this milestone computes one.
 *
 * No `assertNeverConflictSeverity` helper, for the same reason
 * `Corroboration`/`Conflict` have none: no exhaustive switch over all
 * three values exists yet in this milestone.
 */
export type ConflictSeverity = "benign" | "contained" | "corrupting";

/** Every legal `ConflictSeverity`, for tests that need to enumerate the closed set. Not consumed by any production code in this milestone. */
export const ALL_CONFLICT_SEVERITIES: readonly ConflictSeverity[] = ["benign", "contained", "corrupting"];
