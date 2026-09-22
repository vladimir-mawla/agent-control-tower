import type { ConflictId } from "../contracts/ids.js";
import type { Intervention } from "../contracts/intervention.js";
import type { ConflictSeverity } from "../contracts/conflict-severity.js";
import type { AvailableInterventionKind } from "../gate/available-interventions.js";
import type { ArbitrationRung } from "./severity-ladder.js";

/**
 * `ArbitrationRule` — WHY a given ruling landed on the `Intervention` it
 * did, a closed vocabulary rather than a free-text explanation. Matches
 * this codebase's own house style (`Corroboration`, `Conflict`,
 * `ConflictSeverity` — closed string unions, never free text, so a rule's
 * reason is something a reviewer can enumerate and dispute, not merely
 * read prose about).
 *
 *   - `"severity-satisfied"`        — the selected rung meets or exceeds
 *                                      severity's own floor
 *                                      (`SEVERITY_MINIMUM_RUNG`); the
 *                                      ordinary, non-degraded case.
 *   - `"gate-ceiling"`              — no available rung (of any
 *                                      realizability) reaches severity's
 *                                      floor; the gate itself, not a
 *                                      missing claim/checkpoint, is the
 *                                      limiting factor. `escalationRecommended`
 *                                      is always `true` alongside this rule.
 *   - `"checkpoint-unrealizable"`   — the gate permitted `"pause"` and/or
 *                                      `"halt-checkpointed"`, but no single,
 *                                      agreed `CheckpointId` could be
 *                                      resolved from this conflict's own
 *                                      participants (none supplied one, or
 *                                      they disagreed) — see `arbitrate.ts`'s
 *                                      `uniqueCheckpointId`. The ruling
 *                                      degrades to the next weaker rung that
 *                                      IS realizable.
 *   - `"quarantine-unrealizable"`   — the gate permitted `"quarantine"`,
 *                                      but no `ResourceClaimId` could be
 *                                      resolved for any participant of this
 *                                      conflict — the exact "gate says yes,
 *                                      but nothing to revoke" gap plan §2's
 *                                      own `quarantine` refusal names
 *                                      ("the arbitration engine (M5) must
 *                                      fall back to `warn` and say plainly
 *                                      that it could not isolate the
 *                                      agent"). The ruling degrades to the
 *                                      next weaker realizable rung.
 *   - `"human-forced-escalation"`   — nothing the gate permits reaches
 *                                      severity's floor, but a
 *                                      per-conflict-matched, well-formed
 *                                      `HumanAuthorization` was supplied, so
 *                                      `arbitrate` selected `halt`/`forced`
 *                                      instead of merely recommending
 *                                      escalation. `escalationRecommended`
 *                                      is always `false` alongside this
 *                                      rule — a human has already acted, so
 *                                      there is nothing further to escalate.
 */
export type ArbitrationRule =
  | "severity-satisfied"
  | "gate-ceiling"
  | "checkpoint-unrealizable"
  | "quarantine-unrealizable"
  | "human-forced-escalation";

/**
 * `ArbitrationEvidence` — plan §4 M5's own scope line and
 * `.genesis/DONE.html`'s locked spec both require a ruling to cite "the
 * conflict id, the rule, and the evidence." `conflictId` and `rule` live on
 * `InterventionRuling` itself (below); this is the "evidence" half — the
 * inputs a human reviewing this ruling would need to judge it, restated as
 * DATA rather than prose, so a reviewer (or a test) can compare a ruling
 * against its own stated inputs mechanically, never merely read a sentence
 * about them.
 */
export interface ArbitrationEvidence {
  readonly severity: ConflictSeverity;
  /** `AvailableInterventionKind`, not `ArbitrationRung` — exactly the kinds `lib/gate/**` actually permitted for this conflict, before any realizability filtering. `"halt-forced"` never appears here: the gate has structurally no slot for it (`.genesis/decisions/0004-gate.md` Decision 1). */
  readonly availableKinds: readonly AvailableInterventionKind[];
  /** `SEVERITY_MINIMUM_RUNG[severity]` — the floor this ruling was measured against. */
  readonly requiredMinimumRung: ArbitrationRung;
  /** The rung this ruling actually selected — `ArbitrationRung`, not `Intervention["kind"]`, for the identical reason `AvailableInterventionKind` exists at all: a bare `"halt"` cannot distinguish which mode fired. */
  readonly selectedRung: ArbitrationRung;
  /** Whether a per-conflict-matched, well-formed `HumanAuthorization` was available to this ruling at all — `true` does not imply it was USED (a human authorization present for a conflict severity/the gate already resolved without needing it changes nothing); see `rule` for whether it was actually the deciding factor. */
  readonly humanAuthorizationMatched: boolean;
}

/**
 * `InterventionRuling` — what `arbitrate` returns, one per conflict ruled
 * on. Plan §4 M5's own literal return type (`InterventionRuling[]`) names
 * this type without defining its shape anywhere — the identical
 * "the plan names a type it never fixes" gap this milestone's own
 * `HumanAuthorization` (`human-authorization.ts`) already closes the same
 * way: owned here, in `lib/arbitrate/**`, not retrofitted into frozen
 * `lib/contracts/**`.
 */
export interface InterventionRuling {
  /** The specific conflict this ruling is about — `.genesis/DONE.html`'s own locked spec, verbatim: a ruling must "always cite the conflict id." */
  readonly conflictId: ConflictId;
  /** The actual, frozen `Intervention` value this ruling selected — never a kind label alone, so a caller (M6, unbuilt) has everything needed to act on it directly. */
  readonly intervention: Intervention;
  readonly rule: ArbitrationRule;
  readonly evidence: ArbitrationEvidence;
  /** Plan §4 M5's own refusal, verbatim: "to claim full remediation when the strongest *available* option was still weaker than what severity demanded — it must instead return the strongest available option **and** a distinct `escalationRecommended: true` flag." `true` exactly when `rule` is `"gate-ceiling"`, `"checkpoint-unrealizable"`, or `"quarantine-unrealizable"` AND the selected rung still falls short of `evidence.requiredMinimumRung` — see `arbitrate.ts` for the one place this flag is actually computed. */
  readonly escalationRecommended: boolean;
}
