import { describe, expect, it } from "vitest";
import { agentId, timestamp } from "../../lib/contracts/index.js";
import { availableInterventions } from "../../lib/gate/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { buildCheckpoint, buildClaim, buildConflict, buildParticipant, T0 } from "./support.js";

/**
 * FAILURE CASE 4 — plan §5 sketch case 4, kept exactly as sketched: a
 * `corrupting`-severity conflict whose only real evidence is a
 * self-reported claim with no usable checkpoint must degrade to `warn`,
 * plainly flagged as insufficient — never a silently-fabricated
 * `quarantine`, and never a bare `warn` presented as if the situation were
 * adequately handled.
 *
 * WHAT WOULD MAKE THIS FAIL: `arbitrate` selecting `quarantine` despite
 * `available` never containing it (a "never exceed the gate" violation,
 * ADR 0005's own crux); or `escalationRecommended` being `false` for this
 * ruling (which would be exactly the "claim full remediation when the
 * strongest available option was still weaker than what severity
 * demanded" refusal, plan §4 M5, failing silently).
 */
describe("FAILURE CASE 4 — self-reported-only evidence can never buy quarantine, no matter how severe the conflict is", () => {
  it("a corrupting conflict backed by nothing but a self-reported claim and no usable checkpoint gets warn, not quarantine, and is honestly flagged as insufficient", () => {
    const conflict = buildConflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const available = availableInterventions(
      agentId("agent-a"),
      buildClaim({ agent: "agent-a", corroboration: "self-reported" }),
      buildCheckpoint({ reachable: false }),
      timestamp(T0),
    );
    expect(available.has("quarantine")).toBe(false);
    expect(available.has("pause")).toBe(false);

    const [ruling] = arbitrate(
      [conflict],
      [available],
      ["corrupting"],
      [buildParticipant("agent-a", "resource-1", "claim-a"), buildParticipant("agent-b", "resource-1", "claim-b")],
    );
    if (ruling === undefined) throw new Error("unreachable");

    expect(ruling.intervention.kind).toBe("warn");
    expect(ruling.rule).toBe("gate-ceiling");
    expect(ruling.escalationRecommended).toBe(true);
    expect(ruling.evidence.requiredMinimumRung).toBe("quarantine");
    expect(ruling.evidence.selectedRung).toBe("warn");
  });
});
