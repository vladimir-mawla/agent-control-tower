/**
 * `Corroboration` — closed 3-value enum naming HOW the tower came to know
 * a fact about an agent, never collapsed to a boolean "trusted/not
 * trusted" (plan §2):
 *
 *   - `"self-reported"`           — the agent said so; nothing else
 *                                    confirms it.
 *   - `"cross-checked"`           — a second, independent signal the
 *                                    tower itself owns (a resource ledger,
 *                                    a health probe) roughly agrees.
 *   - `"independently-verified"`  — the tower's own probe measured the
 *                                    fact directly, without relying on the
 *                                    agent's account at all.
 *
 * WHY A UNION OF STRING LITERALS, NOT A BOOLEAN OR A SCORE: the plan is
 * explicit that collapsing these three levels loses exactly the
 * distinction later milestones gate on — M4's `availableInterventions`
 * (unbuilt) reads this field to decide whether `quarantine` may even be
 * offered at all (plan §4, M4: "refuses to include `quarantine` when every
 * claim's corroboration is `self-reported`"), which a `trusted: boolean`
 * could not express (there would be nothing to distinguish "roughly
 * agrees" from "the tower checked directly"). Same discipline as
 * `ForgetReason` (memory-ledger, `forget-reason.ts`): a plain string union
 * is exhaustively checkable by `tsc` and trivially safe to embed in a
 * `ResourceClaim` (resource-claim.ts) that must itself be plain data.
 *
 * No `assertNeverCorroboration` helper: nothing in this milestone
 * exhaustively switches over all three values (that is M4/M5's job, once
 * `lib/gate/**` and `lib/arbitrate/**` exist) — matching `ForgetReason`'s
 * own documented choice not to export an unused exhaustiveness helper
 * before a real consumer needs one.
 */
export type Corroboration = "self-reported" | "cross-checked" | "independently-verified";

/** Every legal `Corroboration`, for tests that need to enumerate the closed set. Not consumed by any production code in this milestone. */
export const ALL_CORROBORATIONS: readonly Corroboration[] = [
  "self-reported",
  "cross-checked",
  "independently-verified",
];
