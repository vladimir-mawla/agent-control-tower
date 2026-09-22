import { describe, expect, it } from "vitest";
import { agentId, timestamp } from "../../lib/contracts/index.js";
import { detectConflicts } from "../../lib/conflict/index.js";
import { availableInterventions } from "../../lib/gate/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { combinedAvailableInterventions, type ClaimEvidence } from "../../domains/incident-response/index.js";
import { buildCheckpoint, buildClaim, buildConflict, buildParticipant, T0 } from "./support.js";

/**
 * FAILURE CASE 5 — plan §5 sketch case 5 ("self-report contradicts
 * independent verification"), re-scoped against what this system's
 * primitives can actually express. This system has no notion of "a
 * heartbeat claims all clear" — `Heartbeat` carries only identity and an
 * instant (`lib/conflict/heartbeat.ts`), no content to agree or disagree
 * with a probe about. The closest REAL analogue is `ResourceClaim.
 * corroboration`: one agent's own account of a collision (self-reported)
 * standing against a co-participant's tower-verified account
 * (independently-verified) of the SAME collision.
 *
 * TWO HALVES OF "NEVER TRUST THE SELF-REPORT OVER THE CORROBORATED
 * SIGNAL", BOTH PROVEN, NOT ASSUMED:
 *
 *   (a) the self-report cannot SUPPRESS detection or escalation — the
 *       conflict is detected and still demands a response regardless of
 *       what the self-reporting agent implicitly claims about itself.
 *   (b) the independently-verified evidence does NOT unilaterally licence
 *       action either — `domains/incident-response/gate-aggregation.ts`'s
 *       own intersection policy (ADR 0006 Decision 2) means the STRONGER
 *       participant's evidence never overrides the weaker one's; the
 *       group's own permitted ceiling is set by whichever participant has
 *       the WEAKEST evidence, not the strongest.
 *
 * WHAT WOULD MAKE THIS FAIL: `detectConflicts` starting to read
 * `corroboration` when deciding whether a conflict exists at all (part
 * (a) would then see the self-report suppress detection); or
 * `combinedAvailableInterventions`'s intersection becoming a union (part
 * (b) would then see quarantine unlocked by AutoScaler's evidence alone —
 * this is the identical regression ADR 0006 Decision 2's own sabotage
 * experiment already ran once, against `domains/` source directly; this
 * test proves the same property from the outside, through only the public
 * API, so it would also catch a regression M7 itself could never
 * introduce by editing frozen `domains/` code).
 */
describe("FAILURE CASE 5 — a stronger co-participant's evidence never vouches for a weaker one, and a weaker one never silences the conflict", () => {
  const selfReportedClaim = buildClaim({ agent: "agent-a", mode: "exclusive", corroboration: "self-reported" });
  const verifiedClaim = buildClaim({ agent: "agent-b", mode: "write", corroboration: "independently-verified" });

  it("(a) the conflict is detected regardless of which side's evidence is weak — corroboration plays no role in whether a conflict exists at all", () => {
    const result = detectConflicts([selfReportedClaim, verifiedClaim], []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe("write-write");
  });

  it("(b) taken alone, the independently-verified agent's own evidence unlocks quarantine — but combined with the self-reporting co-participant's, it does not", () => {
    const checkpoint = buildCheckpoint({ reachable: false });
    const verifiedAlone = availableInterventions(agentId("agent-b"), verifiedClaim, checkpoint, timestamp(T0));
    expect(verifiedAlone.has("quarantine")).toBe(true); // in isolation, B's own strong evidence would qualify

    const evidence: readonly ClaimEvidence[] = [
      { agentId: agentId("agent-a"), claim: selfReportedClaim, checkpoint },
      { agentId: agentId("agent-b"), claim: verifiedClaim, checkpoint },
    ];
    const combined = combinedAvailableInterventions(evidence, timestamp(T0));
    // The group's own ceiling is set by the WEAKEST participant, not the
    // strongest — B's independently-verified evidence does not "vouch for"
    // A's self-report.
    expect(combined.has("quarantine")).toBe(false);
  });

  it("neither trust nor distrust resolves the conflict silently: with quarantine withheld, arbitrate can only warn and flag escalation — never a fabricated 'resolved'", () => {
    const conflict = buildConflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const checkpoint = buildCheckpoint({ reachable: false });
    const combined = combinedAvailableInterventions(
      [
        { agentId: agentId("agent-a"), claim: selfReportedClaim, checkpoint },
        { agentId: agentId("agent-b"), claim: verifiedClaim, checkpoint },
      ],
      timestamp(T0),
    );
    const [ruling] = arbitrate(
      [conflict],
      [combined],
      ["corrupting"],
      [buildParticipant("agent-a", "resource-1", "claim-a"), buildParticipant("agent-b", "resource-1", "claim-b")],
    );
    if (ruling === undefined) throw new Error("unreachable");
    expect(ruling.intervention.kind).toBe("warn");
    expect(ruling.escalationRecommended).toBe(true);
  });
});
