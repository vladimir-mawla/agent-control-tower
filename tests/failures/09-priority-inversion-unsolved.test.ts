import { describe, expect, it } from "vitest";
import { agentId, timestamp } from "../../lib/contracts/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { combinedAvailableInterventions, type ClaimEvidence } from "../../domains/incident-response/index.js";
import { buildCheckpoint, buildClaim, buildConflict, buildParticipant, T0 } from "./support.js";

/**
 * FAILURE CASE 9 — plan §5 sketch case 10 ("priority inversion, honestly
 * unsolved"), kept exactly as the plan frames it (this is the one sketch
 * case whose own reasoning survives contact with the real code unchanged —
 * `.genesis/PLAN.md`'s own "considered and rejected" section already names
 * automatic priority-based preemption as descoped, and ADR 0006's own
 * closing section reaffirms it for the M6 domain: "No priority-based
 * preemption, no automatic dispossession"). EXTENDED with one sharper
 * observation the plan itself never states: even in the one case where the
 * tower COULD act, it cannot act SELECTIVELY.
 *
 * SETUP: a low-priority, self-reported background job (LowPriorityAgent)
 * holds a claim on a resource a corrupting-severity remediation
 * (HighPriorityAgent, independently-verified) needs.
 *
 * PART 1 (the plan's own claim, proven): because quarantine requires EVERY
 * relevant participant's evidence to individually clear self-reported
 * (`gate-aggregation.ts`'s intersection policy, case 5's own mechanism),
 * LowPriorityAgent's weak evidence withholds quarantine for the WHOLE
 * conflict — arbitrate can only reach `warn` plus
 * `escalationRecommended: true`, exactly the plan's own words: "it can
 * only reach warn or escalationRecommended: true."
 *
 * PART 2 (the sharper, previously-unstated finding): even granting BOTH
 * agents strong-enough evidence that quarantine IS realizable, quarantine
 * is not a selective tool — `claimIdsOf` (`lib/arbitrate/arbitrate.ts`)
 * revokes EVERY relevant participant's claim, indiscriminately. There is
 * no way to construct an `Intervention` that dispossesses ONLY the
 * low-priority squatter while leaving the legitimate remediation's own
 * claim untouched — the one lever strong enough to act is symmetric, not
 * preferential, so "priority inversion" cannot be solved even manually by
 * a human picking `quarantine` off the menu; the human would still need to
 * separately re-declare the remediation's own claim afterward.
 *
 * WHAT WOULD MAKE THIS FAIL: PART 1 fails if the gate's intersection
 * policy ever became a union (quarantine would then be offered and this
 * test would need `expect(ruling.intervention.kind).toBe("quarantine")`
 * instead of `warn`). PART 2 fails if `arbitrate` ever gained a way to
 * revoke a SUBSET of relevant participants' claims (the assertion that
 * `revokedClaims` names BOTH agents would then be too strong).
 */
describe("FAILURE CASE 9 — priority inversion is not merely unsolved automatically; even the strongest manual lever is symmetric, never preferential", () => {
  const lowPriorityClaim = buildClaim({ agent: "low-priority-agent", mode: "exclusive", corroboration: "self-reported" });
  const highPriorityClaim = buildClaim({ agent: "high-priority-remediation", mode: "write", corroboration: "independently-verified" });
  const checkpoint = buildCheckpoint({ reachable: false });

  it("PART 1 (the plan's own claim): a low-priority self-reported squatter withholds quarantine for the WHOLE conflict, even though a corrupting-severity remediation needs the resource — arbitrate can only warn and flag escalation", () => {
    const conflict = buildConflict("write-write", "contested-resource", ["low-priority-agent", "high-priority-remediation"]);
    const evidence: readonly ClaimEvidence[] = [
      { agentId: agentId("low-priority-agent"), claim: lowPriorityClaim, checkpoint },
      { agentId: agentId("high-priority-remediation"), claim: highPriorityClaim, checkpoint },
    ];
    const combined = combinedAvailableInterventions(evidence, timestamp(T0));
    expect(combined.has("quarantine")).toBe(false);

    const [ruling] = arbitrate(
      [conflict],
      [combined],
      ["corrupting"],
      [
        buildParticipant("low-priority-agent", "contested-resource", "claim-low"),
        buildParticipant("high-priority-remediation", "contested-resource", "claim-high"),
      ],
    );
    if (ruling === undefined) throw new Error("unreachable");
    expect(ruling.intervention.kind).toBe("warn");
    expect(ruling.escalationRecommended).toBe(true);
  });

  it("PART 2 (the sharper finding): even when BOTH agents' evidence is strong enough to realize quarantine, the resulting Intervention revokes BOTH claims — there is no way to preempt only the low-priority squatter", () => {
    const bothStrongLow = buildClaim({ agent: "low-priority-agent", mode: "exclusive", corroboration: "independently-verified" });
    const bothStrongHigh = buildClaim({ agent: "high-priority-remediation", mode: "write", corroboration: "independently-verified" });
    const conflict = buildConflict("write-write", "contested-resource", ["low-priority-agent", "high-priority-remediation"]);
    const evidence: readonly ClaimEvidence[] = [
      { agentId: agentId("low-priority-agent"), claim: bothStrongLow, checkpoint },
      { agentId: agentId("high-priority-remediation"), claim: bothStrongHigh, checkpoint },
    ];
    const combined = combinedAvailableInterventions(evidence, timestamp(T0));
    expect(combined.has("quarantine")).toBe(true); // now realizable at all

    const [ruling] = arbitrate(
      [conflict],
      [combined],
      ["corrupting"],
      [
        buildParticipant("low-priority-agent", "contested-resource", "claim-low"),
        buildParticipant("high-priority-remediation", "contested-resource", "claim-high"),
      ],
    );
    if (ruling === undefined || ruling.intervention.kind !== "quarantine") throw new Error("expected a quarantine ruling");
    const revoked = ruling.intervention.revokedClaims.map(String).sort();
    // Both are revoked — including the legitimate remediation's OWN claim,
    // which a human would have to re-declare separately. Quarantine cannot
    // dispossess only the interloper.
    expect(revoked).toEqual(["claim-high", "claim-low"]);
  });
});
