import { describe, expect, it } from "vitest";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { buildConflict, buildHumanAuth, buildParticipant } from "./support.js";

/**
 * FAILURE CASE 12 — pins a deliberate, disclosed fail-closed choice named
 * directly in the task brief and argued at length in ADR 0005 Decision 8:
 * `arbitrate` THROWS when two conflicts in the same batch share a
 * `ConflictId`, rather than trying to degrade gracefully (e.g. by
 * correlating on `resourceId`/`agentIds` as well). This is not an
 * oversight caught late — ADR 0005 records that the FIRST version of this
 * milestone shipped without this precondition, L4 VERIFY found a live
 * bypass (one `HumanAuthorization`, scoped to conflict A, silently also
 * licensing `halt`/`forced` on a genuinely different conflict B sharing
 * A's id string), and the fix was deliberately a canonical-form
 * PRECONDITION, not correlation machinery: "a resourceId/agentIds-
 * comparison check would need its own answer to questions a canonical-form
 * requirement never has to ask at all."
 *
 * WHAT WOULD MAKE THIS FAIL: `arbitrate` silently accepting a batch with
 * duplicate ids (the throw would not happen, and the second assertion
 * would need to check WHICH conflict the authorization illegitimately also
 * matched — reproducing the exact bypass ADR 0005 Decision 8 reports).
 */
describe("FAILURE CASE 12 — arbitrate refuses a batch with colliding conflict ids outright, rather than guessing how to tell them apart", () => {
  it("two genuinely different conflicts sharing an id string make arbitrate throw, never silently pick one or merge them", () => {
    const c1 = buildConflict("write-write", "resource-1", ["agent-a"], "shared-id-both-conflicts-use");
    const c2 = buildConflict("undeclared-access", "resource-2", ["agent-b"], "shared-id-both-conflicts-use");
    const available = new Set<"observe" | "warn">(["observe", "warn"]);
    const auth = buildHumanAuth("human-1", "shared-id-both-conflicts-use");

    expect(() =>
      arbitrate(
        [c1, c2],
        [available, available],
        ["corrupting", "corrupting"],
        [buildParticipant("agent-a", "resource-1", "claim-a"), buildParticipant("agent-b", "resource-2", "claim-b")],
        auth,
      ),
    ).toThrow();
  });

  it("contrast: the identical scenario with genuinely distinct, real (deterministically-derived) ids does not throw, and the authorization matches only the conflict it actually names", () => {
    const c1 = buildConflict("write-write", "resource-1", ["agent-a"]);
    const c2 = buildConflict("undeclared-access", "resource-2", ["agent-b"]);
    expect(String(c1.id)).not.toBe(String(c2.id));

    const available = new Set<"observe" | "warn">(["observe", "warn"]);
    const auth = buildHumanAuth("human-1", String(c1.id));

    const rulings = arbitrate(
      [c1, c2],
      [available, available],
      ["corrupting", "corrupting"],
      [buildParticipant("agent-a", "resource-1", "claim-a"), buildParticipant("agent-b", "resource-2", "claim-b")],
      auth,
    );

    const rulingForC1 = rulings.find((r) => String(r.conflictId) === String(c1.id));
    const rulingForC2 = rulings.find((r) => String(r.conflictId) === String(c2.id));
    expect(rulingForC1?.intervention.kind).toBe("halt"); // authorized, matches c1
    expect(rulingForC2?.intervention.kind).not.toBe("halt"); // NOT authorized for c2 — refused, not reused
  });
});
