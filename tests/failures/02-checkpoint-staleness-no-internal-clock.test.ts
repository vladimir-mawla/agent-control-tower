import { describe, expect, it } from "vitest";
import { timestamp } from "../../lib/contracts/index.js";
import { STALENESS_BOUND_MS, isCheckpointFresh, availableInterventions } from "../../lib/gate/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { buildCheckpoint, buildClaim, buildConflict, buildParticipant, plusMs, T0 } from "./support.js";
import { agentId } from "../../lib/contracts/index.js";

/**
 * FAILURE CASE 2 — plan §5 sketch case 2 ("stale checkpoint"), KEPT and
 * EXTENDED past what it asks for. The literal sketch ("pause and
 * halt/checkpointed must both drop out ... confirms the exact boundary")
 * is already M4's own falsifiability check, proven with a real N-vs-N+1
 * experiment (`.genesis/decisions/0004-gate.md` Experiment 2) — repeating
 * it unchanged here would be a regression test, not new failure thinking.
 *
 * WHAT THIS CASE ADDS, AND WHY IT IS A GENUINE LIMIT, NOT A RESTATEMENT:
 *
 *   (a) the boundary flip is proven END TO END, through the real gate AND
 *       the real `arbitrate`, showing it changes the actual selected
 *       `Intervention` — not merely a `Set`'s membership — with NOTHING in
 *       either ruling recording that anything changed between the two
 *       calls. There is no diff, no alert, no memory of the stronger
 *       ruling that was possible one millisecond earlier.
 *   (b) a limit nobody wrote down anywhere in six ADRs: `isCheckpointFresh`
 *       has no clock of its own. It never calls `Date.now()` — it trusts
 *       BOTH timestamps it is handed completely, including `now`. A caller
 *       that passes a `now` from decades in the past makes a checkpoint
 *       declared at that same ancient instant look perfectly fresh, and
 *       nothing in `lib/gate` refuses an implausible `now` or cross-checks
 *       it against real wall-clock time.
 */
describe("FAILURE CASE 2 — checkpoint freshness has no memory across calls, and no clock of its own", () => {
  it("baseline, re-proven not merely cited: the gate's own permitted set flips at exactly STALENESS_BOUND_MS, not one millisecond before", () => {
    const fresh = isCheckpointFresh(buildCheckpoint({ declaredAt: T0 }), timestamp(plusMs(T0, STALENESS_BOUND_MS)));
    const stale = isCheckpointFresh(buildCheckpoint({ declaredAt: T0 }), timestamp(plusMs(T0, STALENESS_BOUND_MS + 1)));
    expect(fresh).toBe(true);
    expect(stale).toBe(false);
  });

  it("THE END-TO-END LIMIT: the SAME conflict, ruled on one millisecond apart, gets a different real Intervention (pause vs. warn+escalate) with no field anywhere recording that a stronger ruling existed a moment earlier", () => {
    const conflict = buildConflict("undeclared-access", "resource-1", ["agent-a"]);
    const participants = [buildParticipant("agent-a", "resource-1", "claim-a", { checkpoint: "checkpoint-1" })];

    function ruleAt(now: string) {
      const available = availableInterventions(
        agentId("agent-a"),
        buildClaim({ agent: "agent-a", corroboration: "self-reported" }), // self-reported: quarantine never in play, isolating this test to the checkpoint axis alone
        buildCheckpoint({ declaredAt: T0, id: "checkpoint-1" }),
        timestamp(now),
      );
      const [ruling] = arbitrate([conflict], [available], ["contained"], participants);
      if (ruling === undefined) throw new Error("unreachable");
      return ruling;
    }

    const atBoundary = ruleAt(plusMs(T0, STALENESS_BOUND_MS));
    const pastBoundary = ruleAt(plusMs(T0, STALENESS_BOUND_MS + 1));

    expect(atBoundary.intervention.kind).toBe("pause");
    expect(atBoundary.rule).toBe("severity-satisfied");
    expect(atBoundary.escalationRecommended).toBe(false);

    expect(pastBoundary.intervention.kind).toBe("warn");
    expect(pastBoundary.rule).toBe("gate-ceiling");
    expect(pastBoundary.escalationRecommended).toBe(true);

    // Neither ruling references the other. Nothing about `pastBoundary`
    // says "this used to be a pause a moment ago" — a caller polling this
    // pipeline on a timer would see the response silently weaken with no
    // signal to notice it happened, unless it happened to diff two
    // rulings itself (this system provides no help doing so).
    expect(Object.keys(pastBoundary.evidence)).not.toContain("previousRuling");
  });

  it("A DISCLOSED-NOWHERE LIMIT: isCheckpointFresh has no clock of its own — a checkpoint declared decades ago looks perfectly fresh as long as the caller also lies about 'now' being one second later", () => {
    const ancientlyDeclared = buildCheckpoint({ declaredAt: "1990-01-01T00:00:00.000Z" });
    const alsoAncientNow = timestamp("1990-01-01T00:00:01.000Z"); // one second later, per the CALLER's own claim

    // No call anywhere in lib/gate/clock.ts touches Date.now() — confirmed
    // by reading isCheckpointFresh/parseInstantMs directly. This assertion
    // is therefore not testing "is the real current time near 1990"; it
    // is testing that the function accepts a `now` with zero relationship
    // to reality at all, which the function has no way to refuse.
    expect(isCheckpointFresh(ancientlyDeclared, alsoAncientNow)).toBe(true);

    // Contrast: the identical checkpoint, judged against the ACTUAL
    // current real-world instant, is (correctly, structurally) stale —
    // proving the function's only defense is "the two instants you handed
    // me are close together," never "the instants you handed me are real."
    expect(isCheckpointFresh(ancientlyDeclared, timestamp(new Date().toISOString()))).toBe(false);
  });
});
