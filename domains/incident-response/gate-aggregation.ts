import {
  agentId,
  checkpointId,
  type AgentId,
  type CheckpointDeclaration,
  type ResourceClaim,
  type ResourceId,
  type Timestamp,
} from "../../lib/contracts/index.js";
import { availableInterventions, type AvailableInterventionKind, type AvailableInterventionSet } from "../../lib/gate/index.js";

/**
 * THE GAP THIS FILE CLOSES, NAMED EXPLICITLY: `lib/gate/available-
 * interventions.ts`'s own header states its scope is evaluated "against
 * exactly one claim" and explicitly defers the multi-claim question:
 * "See `.genesis/decisions/0004-gate.md` for why closing the multi-claim
 * ('every claim's') half of that [quarantine] sentence is left to M5, not
 * guessed at here." But `lib/arbitrate/arbitrate.ts` (M5, frozen) never
 * actually closes it either — its own signature takes `available:
 * readonly AvailableInterventionSet[]`, ONE ALREADY-COMPUTED set per
 * conflict, as an INPUT it receives from its own caller; it has no code
 * that ever calls `availableInterventions` itself, let alone combines
 * several claims' worth of it. The gap `0004-gate.md` names as "left to
 * M5" was never actually closed there — it fell through, unclosed, all
 * the way down to whichever milestone first has multiple real claims per
 * conflict to combine into the single set `arbitrate` expects. That
 * milestone is this one: M3's own contrived unit fixtures never model two
 * agents' claims on one contested resource behind a SINGLE `available`
 * set at all (`lib/conflict/__tests__/fixtures.ts` builds claims and
 * checks conflicts, never a combined gate result), and M4/M5's own test
 * suites always hand-construct `available` directly (`availableSet(...)`
 * in `lib/arbitrate/__tests__/fixtures.ts`) rather than deriving it from
 * real, multiple claims. This is a genuine, previously-undocumented plan
 * defect, named here rather than silently resolved — see this milestone's
 * own `.genesis/decisions/0006-domain.md` for the decision record.
 *
 * THE POLICY CHOSEN: INTERSECTION, NOT UNION — ARGUED, NOT ASSUMED. Plan
 * §2's own quarantine text ("refuses to fire when every revoked claim's
 * corroboration is self-reported") admits two readings for a MULTI-agent
 * conflict: (a) offer quarantine for the conflict as a whole once AT LEAST
 * ONE participant's claim clears self-reported (a per-claim OR), or
 * (b) offer it only once EVERY relevant participant's own evidence would
 * independently support it (an AND / intersection). Reading (a) is
 * dangerous given what `lib/arbitrate/arbitrate.ts`'s own `claimIdsOf`
 * actually does once quarantine IS offered: it revokes EVERY relevant
 * participant's claim indiscriminately (`NonEmptyArray<ResourceClaimId>`
 * built from every relevant participant, not filtered by that
 * participant's own corroboration) — so reading (a) would let one
 * well-corroborated agent's evidence license revoking a DIFFERENT agent's
 * claim this project's own thesis says the tower has no business
 * disbelieving-and-acting-on ("the tower may distrust the claim... but may
 * never fabricate one," `checkpoint-declaration.ts`'s header, restated for
 * quarantine's own analogous case). Reading (b) — this file's choice — is
 * the same fail-closed shape every other ambiguous axis in this codebase
 * already resolves: checkpoint freshness fails closed on an unparseable or
 * future-dated instant (`lib/gate/clock.ts`), claim-timestamp disagreement
 * fails closed to "treat as conflicting" (`.genesis/decisions/
 * 0003-detection.md` Decision 4), and a caller-authorization mismatch
 * fails closed to "refused, not silently reused" (`.genesis/decisions/
 * 0005-arbitration.md` Decision 8). This file is the same discipline
 * applied to the one new axis this milestone introduces: a KIND is
 * available for a conflict only when EVERY relevant participant's own,
 * individually-evaluated evidence supports it.
 *
 * HOW: for each participant relevant to a conflict, call the real, frozen
 * `availableInterventions` (never re-implemented or approximated here)
 * with that participant's own `(agentId, claim, checkpoint)` and the
 * conflict's shared `now`, then intersect the resulting sets. `observe`
 * and `warn` survive every intersection because `availableInterventions`
 * itself includes both unconditionally for every input
 * (`available-interventions.ts`'s own documented baseline) — this
 * function never has to special-case them.
 *
 * COVERAGE, ENFORCED, NOT ASSUMED — see `.genesis/decisions/
 * 0008-incomplete-evidence.md` for the full defect report and argument.
 * Intersecting over fewer sets than the conflict actually has makes an
 * INCOMPLETE `evidence` array strictly MORE permissive than a complete
 * one — backwards for a fail-closed policy, and a real, live defect: a
 * caller that (for example) only gathers evidence for agents that
 * heartbeated this cycle, silently dropping a weak-evidence participant,
 * gets a WIDER `AvailableInterventionSet` than the honest one, which
 * `arbitrate` then acts on with full confidence (`rule:
 * "severity-satisfied"`, `escalationRecommended: false`) — reaching
 * exactly the "disbelieve a self-report and act on that disbelief" outcome
 * this file's whole intersection policy exists to refuse, through the
 * CORRECT combinator fed INCOMPLETE input (distinct from failure case 10's
 * wrong-combinator scenario). `combinedAvailableInterventions` therefore
 * takes the conflict's full participant set as its own explicit
 * `conflictParticipants` parameter — never inferred from `evidence` itself,
 * since `evidence`'s own incompleteness is exactly the thing being
 * checked — and THROWS when `evidence` does not name exactly that set, one
 * entry per participant, no more and no fewer. See this function's own
 * body for why throwing, not a refusal value, was chosen.
 */
export interface ClaimEvidence {
  /** The agent this evidence is ABOUT — usually equal to `claim.agentId`, but see `noLegitimateClaimEvidence` below for the one case where it is deliberately NOT (no legitimate claim exists at all). */
  readonly agentId: AgentId;
  readonly claim: ResourceClaim;
  readonly checkpoint: CheckpointDeclaration;
}

/**
 * Combines one conflict's worth of per-agent evidence into the single
 * `AvailableInterventionSet` `arbitrate` expects for that conflict — see
 * this file's header for the intersection policy and why it was chosen
 * over the alternative, and `.genesis/decisions/0008-incomplete-evidence.md`
 * for the coverage check below.
 *
 * `conflictParticipants` is the conflict's own full, authoritative
 * participant set (`DetectedConflict.agentIds`, or the identical set a
 * caller who built the conflict by hand already has) — NEVER derived from
 * `evidence` itself, because `evidence` being short exactly one participant
 * is the failure this check exists to catch; deriving the expected set from
 * the very array being validated would make the check unable to see its own
 * blind spot.
 *
 * FAILS CLOSED BY THROWING (not a refusal return value) when `evidence`
 * does not name EXACTLY `conflictParticipants` — one `ClaimEvidence` entry
 * per participant, no fewer (the live defect: a dropped participant makes
 * the intersection run over fewer sets, which can only make the result
 * MORE permissive) and no more (an entry for an agent outside the conflict
 * is equally a sign the two arrays were not built from the same conflict,
 * and this file's whole discipline is to require the canonical, exact
 * shape rather than tolerate a partial one — see the ADR for the
 * `lib/arbitrate/arbitrate.ts` precedent this follows: throwing on a
 * checkable-from-data-in-hand precondition, such as its own length-mismatch
 * and duplicate-conflict-id guards). This is a caller bug, not a
 * legitimate business outcome a typed refusal value would need to express
 * to a normal, well-behaved caller — see the ADR for the fuller argument.
 *
 * An empty `evidence` array PAIRED WITH an empty `conflictParticipants`
 * (no relevant participant at all — should not occur for a real conflict,
 * since `detectConflicts` only ever names an agent that is genuinely party
 * to the collision) still returns the same unconditional baseline
 * `availableInterventions` itself would, rather than an empty set — this
 * disclosed fallback is unchanged by this check, since it is the one case
 * where `evidence` and `conflictParticipants` already agree.
 */
export function combinedAvailableInterventions(
  evidence: readonly ClaimEvidence[],
  conflictParticipants: readonly AgentId[],
  now: Timestamp,
): AvailableInterventionSet {
  const participantKeys = conflictParticipants.map((a) => String(a));
  const participantSet = new Set(participantKeys);
  if (participantSet.size !== conflictParticipants.length) {
    throw new Error(
      `combinedAvailableInterventions: conflictParticipants contains a duplicate agent id (${JSON.stringify(participantKeys)}) — ` +
        "every participant must be named exactly once.",
    );
  }

  const evidenceKeys = evidence.map((one) => String(one.agentId));
  const evidenceSet = new Set(evidenceKeys);
  if (evidenceSet.size !== evidence.length) {
    throw new Error(
      `combinedAvailableInterventions: evidence contains a duplicate agent id (${JSON.stringify(evidenceKeys)}) — ` +
        "every participant's evidence must appear exactly once.",
    );
  }

  const missing = conflictParticipants.filter((a) => !evidenceSet.has(String(a)));
  const extra = evidence.filter((one) => !participantSet.has(String(one.agentId)));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      "combinedAvailableInterventions: evidence does not cover this conflict's participants exactly — " +
        `missing evidence for: [${missing.map(String).join(", ")}]; ` +
        `evidence supplied for agents outside conflictParticipants: [${extra.map((one) => String(one.agentId)).join(", ")}]. ` +
        "Every agent in conflictParticipants must have exactly one ClaimEvidence entry, and every ClaimEvidence " +
        "entry's agentId must be one of conflictParticipants. This function refuses to intersect over fewer sets " +
        "than the conflict actually has — see .genesis/decisions/0008-incomplete-evidence.md.",
    );
  }

  if (evidence.length === 0) {
    return new Set<AvailableInterventionKind>(["observe", "warn"]);
  }
  let combined: Set<AvailableInterventionKind> | null = null;
  for (const one of evidence) {
    const own = availableInterventions(one.agentId, one.claim, one.checkpoint, now);
    if (combined === null) {
      combined = new Set(own);
    } else {
      for (const kind of combined) {
        if (!own.has(kind)) combined.delete(kind);
      }
    }
  }
  // `combined` is non-null here: the `evidence.length === 0` branch above
  // already returned, so the loop ran at least once.
  return combined ?? new Set<AvailableInterventionKind>(["observe", "warn"]);
}

/**
 * `NO_LEGITIMATE_CLAIM_AGENT` — a sentinel `AgentId` naming "whatever
 * claim (if any) exists on this resource, it does not belong to the agent
 * this evidence is about." `undeclared-access` is, by plan §2's own
 * definition, exactly the case where NO `ResourceClaim` exists for the
 * offending agent on the resource it touched — but
 * `availableInterventions`'s own signature (`lib/gate/available-
 * interventions.ts`, frozen) requires an actual `ResourceClaim` object as
 * its third parameter; there is no `null`/optional slot for "no claim at
 * all." This sentinel is how this domain asks the real, frozen gate "what
 * can the tower do about an agent that never made a legitimate claim
 * here" WITHOUT fabricating a claim that agent never made: passing a claim
 * whose OWN `agentId` provably differs from the agent under discussion
 * exercises `availableInterventions`'s own documented consistency guard
 * (its header: "when `claim.agentId !== agent`, this function fails
 * closed to the baseline ONLY") for exactly the reason that guard exists —
 * "the report and the process in question" are NOT "the same one," here
 * because there is no report (claim) from that process at all. This is
 * not a hack reaching around the gate's real behavior; it is the honest
 * translation of "no claim exists" into the one shape a function requiring
 * a `ResourceClaim` argument can accept, and it is covered by this
 * milestone's own `__tests__/gate-aggregation.test.ts`, which proves the
 * sentinel's own field values (mode, ttl, corroboration) never influence
 * the result — only the agent-identity mismatch does.
 */
export const NO_LEGITIMATE_CLAIM_AGENT: AgentId = agentId("no-legitimate-claim-on-file");

/**
 * Builds the one `ClaimEvidence` entry for an `undeclared-access`
 * conflict's offending agent — see `NO_LEGITIMATE_CLAIM_AGENT`'s own
 * header for why this is the honest shape, not a workaround. The
 * sentinel claim's `mode`/`ttl`/`corroboration` are irrelevant BY
 * CONSTRUCTION (the mismatch branch returns before any of them is ever
 * read) and are picked to look as unremarkable as possible so a reader
 * does not mistake them for load-bearing.
 */
export function noLegitimateClaimEvidence(agent: AgentId, resource: ResourceId, now: Timestamp): ClaimEvidence {
  return {
    agentId: agent,
    claim: {
      agentId: NO_LEGITIMATE_CLAIM_AGENT,
      resourceId: resource,
      mode: "read",
      declaredAt: now,
      ttl: 0,
      corroboration: "self-reported",
    },
    checkpoint: {
      reachable: false,
      resumable: false,
      checkpointId: checkpointId("no-checkpoint-declared"),
      declaredAt: now,
    },
  };
}
