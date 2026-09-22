import { describe, expect, it } from "vitest";
import { agentId, timestamp } from "../../lib/contracts/index.js";
import { availableInterventions, type AvailableInterventionKind } from "../../lib/gate/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { combinedAvailableInterventions, type ClaimEvidence } from "../../domains/incident-response/index.js";
import { buildCheckpoint, buildClaim, buildConflict, buildParticipant, T0 } from "./support.js";

/**
 * FAILURE CASE 10 — a limit named but never adversarially demonstrated
 * anywhere in six ADRs: ADR 0006 Decision 4c states plainly that
 * `gate-aggregation.ts`'s intersection policy is "a load-bearing safety
 * policy [that] now lives outside the engine... protected by this
 * milestone's own ordinary unit tests... rather than by `lib/gate`'s
 * architecture-scan-backed guarantees." That sentence is a disclosure.
 * This case is the proof: nothing in `lib/gate` or `lib/arbitrate` (both
 * frozen) can tell the difference between an `AvailableInterventionSet`
 * computed correctly (via the real `combinedAvailableInterventions`) and
 * one computed by a UNION instead of an intersection — both are just
 * `ReadonlySet<AvailableInterventionKind>` to `arbitrate`, indistinguishable
 * in shape, and `arbitrate` produces an equally confident-LOOKING ruling
 * (`rule: "severity-satisfied"`, `escalationRecommended: false`) either
 * way.
 *
 * THIS IS NOT A HYPOTHETICAL BUG IN `domains/`'S OWN CODE — this milestone
 * changes nothing in `domains/**` (frozen). It is a fact about the
 * ARCHITECTURE: the actual safety property "quarantine requires every
 * relevant participant to individually clear self-reported" is a
 * CONVENTION `gate-aggregation.ts` chooses to uphold, not a rule `lib/`
 * enforces on its own input. Any future caller — a bug in a later
 * milestone's own aggregation code, or a domain this project never builds —
 * that computes `available` some other way gets no error, no warning, and
 * no way to know it just handed `arbitrate` a set with a hole in it.
 *
 * WHAT WOULD MAKE THIS FAIL: `arbitrate` gaining some way to validate
 * `available` against the underlying evidence it was computed from (which
 * would require `arbitrate`'s own signature to accept claims/checkpoints
 * directly — a large, real departure from its current, frozen shape); or
 * `combinedAvailableInterventions`'s intersection becoming the only way
 * `AvailableInterventionSet` values can ever be constructed (which
 * `AvailableInterventionSet`'s own definition, a bare `ReadonlySet`, does
 * not and structurally cannot enforce).
 */
describe("FAILURE CASE 10 — the intersection policy that keeps quarantine honest is a convention in domains/, not a guarantee lib/ enforces on its own input", () => {
  const selfReportedClaim = buildClaim({ agent: "low-evidence-agent", mode: "exclusive", corroboration: "self-reported" });
  const verifiedClaim = buildClaim({ agent: "strong-evidence-agent", mode: "write", corroboration: "independently-verified" });
  const checkpoint = buildCheckpoint({ reachable: false });

  it("used correctly, the real combinedAvailableInterventions withholds quarantine — this is the property being bypassed below, proven to hold when the real function is actually called", () => {
    const conflict = buildConflict("write-write", "resource-1", ["low-evidence-agent", "strong-evidence-agent"]);
    const evidence: readonly ClaimEvidence[] = [
      { agentId: agentId("low-evidence-agent"), claim: selfReportedClaim, checkpoint },
      { agentId: agentId("strong-evidence-agent"), claim: verifiedClaim, checkpoint },
    ];
    const correctlyCombined = combinedAvailableInterventions(evidence, conflict.agentIds, timestamp(T0));
    expect(correctlyCombined.has("quarantine")).toBe(false);
  });

  it("THE LIMIT: a hand-built UNION of the same two participants' individual gate results slips past arbitrate with no refusal, revoking the self-reported agent's claim off the strong-evidence agent's evidence alone", () => {
    const conflict = buildConflict("write-write", "resource-1", ["low-evidence-agent", "strong-evidence-agent"]);

    // Deliberately NOT calling combinedAvailableInterventions — this is
    // what a caller who reached for the wrong combinator (or reimplemented
    // it slightly wrong) would produce: whatever ANY participant's own
    // evidence permits, unioned rather than intersected.
    const low = availableInterventions(agentId("low-evidence-agent"), selfReportedClaim, checkpoint, timestamp(T0));
    const strong = availableInterventions(agentId("strong-evidence-agent"), verifiedClaim, checkpoint, timestamp(T0));
    const naiveUnion = new Set<AvailableInterventionKind>([...low, ...strong]);
    expect(naiveUnion.has("quarantine")).toBe(true); // the hole: strong's own evidence alone put it here

    const [ruling] = arbitrate(
      [conflict],
      [naiveUnion],
      ["corrupting"],
      [
        buildParticipant("low-evidence-agent", "resource-1", "claim-low"),
        buildParticipant("strong-evidence-agent", "resource-1", "claim-strong"),
      ],
    );
    if (ruling === undefined) throw new Error("unreachable");

    // arbitrate has no way to know `naiveUnion` was computed wrong — it
    // fires quarantine with FULL confidence, not a degraded/flagged ruling.
    expect(ruling.intervention.kind).toBe("quarantine");
    expect(ruling.rule).toBe("severity-satisfied");
    expect(ruling.escalationRecommended).toBe(false);
    if (ruling.intervention.kind === "quarantine") {
      // The self-reported agent's claim is revoked anyway — the exact
      // "disbelieve a self-report and act on that disbelief" failure
      // ADR 0006 Decision 2 names as the whole reason intersection was
      // chosen over union. lib/arbitrate has no way to catch this; only
      // domains/gate-aggregation.ts's own convention prevents it.
      expect(ruling.intervention.revokedClaims.map(String)).toContain("claim-low");
    }
  });
});
