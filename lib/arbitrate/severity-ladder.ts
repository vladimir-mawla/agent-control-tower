import type { AvailableInterventionKind } from "../gate/available-interventions.js";
import type { ConflictSeverity } from "../contracts/conflict-severity.js";

/**
 * `ArbitrationRung` — `AvailableInterventionKind` (the gate's own closed
 * vocabulary, `lib/gate/available-interventions.ts`) plus exactly one more
 * member, `"halt-forced"`, for the one intervention the gate structurally
 * can never speak to at all (`.genesis/decisions/0004-gate.md` Decision 1:
 * "there is no third, halt-shaped member in this union... no code path in
 * `availableInterventions` ... could ever produce one"). This is the same
 * "the plan names a distinction no existing type can express, so build the
 * type that can" move `AvailableInterventionKind` itself already made once
 * for `Intervention["kind"]` — applied here one layer up, for the same
 * reason: `arbitrate` needs a single, orderable vocabulary spanning both
 * "what the gate permits" and "what a human can additionally authorize,"
 * and no existing type names both.
 *
 * THIS TYPE IS NOT A CHANNEL FOR `arbitrate` TO SPEAK TO THE GATE — it
 * never crosses `lib/gate/**`'s own boundary in the other direction, and
 * `lib/gate/**` remains untouched by this milestone (`git diff main --
 * lib/gate` stays empty). It exists purely as `lib/arbitrate/**`'s own
 * internal severity-and-selection vocabulary.
 */
export type ArbitrationRung = AvailableInterventionKind | "halt-forced";

/**
 * THE STRENGTH LADDER, STATED ONCE, AS A DISCLOSED POLICY ORDERING — NOT A
 * FACT ANY FROZEN CONTRACT OR THE PLAN ITSELF STATES ANYWHERE. Plan §2
 * lists `Intervention`'s five top-level kinds in one fixed order
 * (`observe`, `warn`, `pause`, `halt`, `quarantine`) but never asserts that
 * order is a STRENGTH ranking — this milestone is the first that needs a
 * total order at all (to compare "what severity warrants" against "what
 * the gate permits"), so inventing one is unavoidable, the same "some
 * number/order has to exist for this phrase to mean anything, and no
 * frozen source names it" position `.genesis/decisions/0004-gate.md`
 * Decision 5 already took for `STALENESS_BOUND_MS`.
 *
 * THE ORDER CHOSEN, AND WHY, PER RUNG:
 *   1. `observe`            — no data, no effect. The floor.
 *   2. `warn`                — a message only; still refuses any field
 *                              capable of touching agent state
 *                              (`intervention.ts`'s own header).
 *   3. `pause`               — the first rung that actually acts, but only
 *                              at an agent-declared, fresh, safe point.
 *   4. `halt-checkpointed`   — stronger than `pause` (stops the agent
 *                              entirely, not merely pauses it) but built on
 *                              the identical checkpoint-freshness gate as
 *                              `pause`, so it sits directly above it.
 *   5. `quarantine`          — placed above both checkpoint-anchored modes
 *                              deliberately: it is the one intervention the
 *                              gate will only ever permit once corroboration
 *                              has moved PAST `self-reported`
 *                              (`.genesis/decisions/0004-gate.md`'s own
 *                              `available-interventions.ts` — quarantine
 *                              requires `cross-checked` or
 *                              `independently-verified`). A checkpoint's
 *                              freshness is itself only ever `self-reported`
 *                              by the agent being acted on
 *                              (`checkpoint-declaration.ts`'s own header:
 *                              "only the agent... can know its own safe-stop
 *                              points"); quarantine is therefore the
 *                              strongest rung the gate ever permits on
 *                              evidence the tower did NOT have to take the
 *                              agent's own word for — the most defensible
 *                              rung an automated ladder can reach on its
 *                              own.
 *   6. `halt-forced`         — the one rung `arbitrate` may select without
 *                              the gate ever having permitted it, and only
 *                              ever via a per-conflict-matched
 *                              `HumanAuthorization` (see `arbitrate.ts`).
 *                              Placed strictly above `quarantine`
 *                              because it is the plan's own named
 *                              "riskiest design decision" and "the single
 *                              highest-risk outcome in the whole system" —
 *                              nothing the automated ladder computes is
 *                              ever treated as equal to or stronger than a
 *                              human's own sign-off.
 */
const RUNG_ORDER: readonly ArbitrationRung[] = [
  "observe",
  "warn",
  "pause",
  "halt-checkpointed",
  "quarantine",
  "halt-forced",
];

/** `RUNG_ORDER`'s own index for `rung` — the numeric form every comparison in `arbitrate.ts` actually uses. Exported so this milestone's own tests build fixtures against the real ranking rather than a hand-copied number that could silently drift out of sync with it. */
export function rungRank(rung: ArbitrationRung): number {
  const index = RUNG_ORDER.indexOf(rung);
  if (index === -1) {
    throw new Error(`Unreachable: rungRank received an ArbitrationRung not present in RUNG_ORDER: ${String(rung)}`);
  }
  return index;
}

/** Every legal `ArbitrationRung`, weakest first — the same closed-set-enumeration convention `lib/contracts/**`'s `ALL_CORROBORATIONS`/`ALL_CONFLICTS`/`ALL_CONFLICT_SEVERITIES` and `lib/gate/**`'s `ALL_AVAILABLE_INTERVENTION_KINDS` already use. */
export const ALL_ARBITRATION_RUNGS: readonly ArbitrationRung[] = RUNG_ORDER;

/**
 * `SEVERITY_MINIMUM_RUNG` — the disclosed policy table mapping each
 * `ConflictSeverity` to the WEAKEST rung that counts as an adequate
 * response, never the target to escalate TOWARD regardless of whether a
 * weaker option already suffices. This is the actual mechanism behind
 * `.genesis/PLAN.md`'s own thesis (§1): "the safest-looking move ('just
 * stop it') is the one most likely to be destructive when the tower is
 * wrong" — `arbitrate.ts`'s own selection rule (see that file's header)
 * picks the WEAKEST available-and-realizable rung that meets or exceeds
 * this floor, never the strongest one merely because it happens to be
 * available, so a `contained` conflict is never escalated to `quarantine`
 * just because quarantine happens to be permitted.
 *
 * `corrupting`'s own floor is `quarantine`, deliberately NOT
 * `halt-forced`: severity, computed by this project's own rules
 * (`lib/contracts/conflict-severity.ts`'s header: "never asserted directly
 * by an agent about itself... computed from the conflicting resource's
 * declared blast radius and the conflict kind"), can never by itself
 * DEMAND a human-authorized forced halt — only a human can grant that,
 * never a severity computation (the identical "no engine may construct
 * `halt`/`forced` on its own initiative" refusal `.genesis/decisions/
 * 0001-contracts.md` Decision 2 already states, restated here as: severity
 * alone may never even IMPLY it is owed). `arbitrate.ts` reaches
 * `halt-forced` only through its own, separate, human-authorization-gated
 * path — never because this table names it as a floor.
 *
 * No numeric evidence backs these three floors — the identical, honestly
 * stated limitation `.genesis/decisions/0004-gate.md` Decision 5 already
 * discloses for `STALENESS_BOUND_MS`: some assignment has to exist for
 * "warranted by severity" to mean anything at all, and this repository has
 * no real incident-response corpus to derive one from.
 */
export const SEVERITY_MINIMUM_RUNG: Readonly<Record<ConflictSeverity, ArbitrationRung>> = {
  benign: "observe",
  contained: "pause",
  corrupting: "quarantine",
};
