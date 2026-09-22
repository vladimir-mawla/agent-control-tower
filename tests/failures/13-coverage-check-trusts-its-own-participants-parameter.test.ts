import { describe, expect, it } from "vitest";
import { agentId, timestamp } from "../../lib/contracts/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { combinedAvailableInterventions, type ClaimEvidence } from "../../domains/incident-response/index.js";
import { buildCheckpoint, buildClaim, buildConflict, buildParticipant, T0 } from "./support.js";

/**
 * FAILURE CASE 13 — the honest remaining limit of the incomplete-evidence
 * fix (`.genesis/decisions/0008-incomplete-evidence.md`, landed as a bug
 * fix on top of M7, not part of M7 itself). That fix makes
 * `combinedAvailableInterventions` THROW when its `evidence` array does
 * not name exactly its OWN `conflictParticipants` parameter — closing the
 * specific defect where a caller silently dropped a participant's evidence
 * while still (correctly) naming every participant in `conflictParticipants`.
 *
 * THIS CASE PINS WHAT THAT FIX DOES NOT AND STRUCTURALLY CANNOT CATCH:
 * `combinedAvailableInterventions` has no way to independently verify that
 * the `conflictParticipants` array IT WAS GIVEN is itself the conflict's
 * real, full participant set — it only checks that `evidence` and
 * `conflictParticipants` agree WITH EACH OTHER. A caller whose own upstream
 * aggregation derives BOTH arrays from the same incomplete source (e.g.
 * "only agents that heartbeated this cycle," filtered once and reused for
 * both) drops the missing participant from both arguments consistently —
 * the two arrays agree, the coverage check has nothing to object to, and
 * the exact live defect the fix closes (a dropped self-reported
 * participant wrongly unlocking `quarantine`) reappears, this time with no
 * exception at all.
 *
 * This is not a hypothetical: `conflictParticipants` is meant to be
 * `DetectedConflict.agentIds`, but this function is never handed a
 * `DetectedConflict` to check against — only whatever array the caller
 * chooses to pass. The fix upgrades an internal-consistency check
 * (`evidence` vs. its own second argument) into a real guarantee only to
 * the extent a caller's OWN plumbing keeps that argument honest; it is not
 * an external cross-check against `detectConflicts`'s real output.
 *
 * WHAT WOULD MAKE THIS FAIL: `combinedAvailableInterventions` gaining a
 * fourth parameter that receives the real `DetectedConflict` (or is wired
 * through `detectConflicts` some other way) and independently re-derives
 * `conflictParticipants` from it rather than trusting the value the caller
 * supplies — a bigger structural change than the coverage-check bug fix
 * this case follows, and not one this fix attempts.
 */
describe("FAILURE CASE 13 — combinedAvailableInterventions' coverage check trusts its own conflictParticipants argument; it cannot tell that argument apart from the real conflict if a caller derives both incompletely", () => {
  const weakClaim = buildClaim({ agent: "weak-agent", mode: "exclusive", corroboration: "self-reported" });
  const strongClaim = buildClaim({ agent: "strong-agent", mode: "write", corroboration: "independently-verified" });
  const checkpoint = buildCheckpoint({ reachable: false });

  it("used correctly (both agents in both arrays), the real conflict withholds quarantine — the property the residual gap below defeats", () => {
    const conflict = buildConflict("write-write", "resource-1", ["weak-agent", "strong-agent"]);
    const evidence: readonly ClaimEvidence[] = [
      { agentId: agentId("weak-agent"), claim: weakClaim, checkpoint },
      { agentId: agentId("strong-agent"), claim: strongClaim, checkpoint },
    ];
    const combined = combinedAvailableInterventions(evidence, conflict.agentIds, timestamp(T0));
    expect(combined.has("quarantine")).toBe(false);
  });

  it("THE RESIDUAL: a caller whose own upstream filtering drops the same participant from BOTH evidence AND conflictParticipants gets no exception, and quarantine wrongly reappears", () => {
    // The REAL conflict, as `detectConflicts` would actually report it, has
    // TWO participants. A caller with its own buggy aggregation step
    // (e.g. "only agents that heartbeated this cycle") builds its
    // `evidence` AND its `conflictParticipants` from that same filtered
    // view, so only strong-agent survives into either array.
    const realConflict = buildConflict("write-write", "resource-1", ["weak-agent", "strong-agent"]);
    const callersIncompleteParticipants = [agentId("strong-agent")]; // weak-agent silently dropped here too
    const evidence: readonly ClaimEvidence[] = [{ agentId: agentId("strong-agent"), claim: strongClaim, checkpoint }];

    // No throw: evidence and conflictParticipants agree with EACH OTHER,
    // which is all this function can ever check.
    const combined = combinedAvailableInterventions(evidence, callersIncompleteParticipants, timestamp(T0));
    expect(combined.has("quarantine")).toBe(true); // the hole: strong-agent's own evidence alone put it here

    // Fed into arbitrate against the REAL, full conflict (both agents),
    // arbitrate has no way to know `combined` was computed from an
    // incomplete view either — it fires quarantine with full confidence
    // and revokes weak-agent's still-self-reported claim anyway, the
    // identical outcome ADR 0008 (and ADR 0006 Decision 2 before it) both
    // name as the whole reason intersection-over-complete-evidence exists.
    const [ruling] = arbitrate(
      [realConflict],
      [combined],
      ["corrupting"],
      [buildParticipant("weak-agent", "resource-1", "claim-weak"), buildParticipant("strong-agent", "resource-1", "claim-strong")],
    );
    if (ruling === undefined) throw new Error("unreachable");
    expect(ruling.intervention.kind).toBe("quarantine");
    expect(ruling.rule).toBe("severity-satisfied");
    expect(ruling.escalationRecommended).toBe(false);
    if (ruling.intervention.kind === "quarantine") {
      expect(ruling.intervention.revokedClaims.map(String)).toContain("claim-weak");
    }
  });
});
