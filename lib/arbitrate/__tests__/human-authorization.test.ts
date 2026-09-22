import { describe, expect, it } from "vitest";
import { arbitrate } from "../arbitrate.js";
import { matchesConflict } from "../human-authorization.js";
import { availableSet, conflict, humanAuthorization } from "./fixtures.js";

describe("matchesConflict — the per-conflict authorization check plan §4 M5 names verbatim", () => {
  it("matches when the authorization's own conflictId equals the conflict being checked", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    expect(matchesConflict(humanAuthorization("human-1", c.id), c.id)).toBe(true);
  });

  it("does NOT match a different conflict's id, even with an otherwise well-formed authorization", () => {
    const a = conflict("undeclared-access", "resource-1", ["agent-a"], "conflict-A");
    const b = conflict("undeclared-access", "resource-2", ["agent-b"], "conflict-B");
    expect(matchesConflict(humanAuthorization("human-1", a.id), b.id)).toBe(false);
  });

  it("does not match when no authorization was supplied at all", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    expect(matchesConflict(undefined, c.id)).toBe(false);
  });
});

/**
 * `.genesis/PLAN.md` §4 M5's own falsifiability check, verbatim: "A second
 * test supplies a `humanAuthorization` for conflict A and requests
 * `halt`/`forced` for conflict B, and confirms the mismatch is refused."
 * "Requests `halt`/`forced` for B" here means: B's own severity/available
 * pairing is one where, ABSENT a matching authorization, `arbitrate`
 * would reach for `halt`/`forced` as its human-escalation path (severity
 * exceeds everything the gate permits) — and confirms that an
 * authorization scoped to a DIFFERENT conflict (A) does not license it.
 */
describe("arbitrate — an authorization for conflict A must not license a forced halt on conflict B (the per-conflict match, end to end)", () => {
  it("A's authorization does not carry over to B: B falls back to escalationRecommended instead of a forced halt", () => {
    const conflictA = conflict("undeclared-access", "resource-a", ["agent-a"], "conflict-A");
    const conflictB = conflict("undeclared-access", "resource-b", ["agent-b"], "conflict-B");
    const authForA = humanAuthorization("human-1", conflictA.id);

    const rulings = arbitrate(
      [conflictA, conflictB],
      [availableSet(["observe", "warn"]), availableSet(["observe", "warn"])],
      ["corrupting", "corrupting"],
      [],
      authForA,
    );

    const [rulingA, rulingB] = rulings;

    // A: the authorization DOES match its own conflict — forced halt fires.
    expect(rulingA!.intervention).toEqual({ kind: "halt", mode: "forced", authorizedBy: "human-1", conflictId: conflictA.id });
    expect(rulingA!.rule).toBe("human-forced-escalation");
    expect(rulingA!.escalationRecommended).toBe(false);

    // B: the SAME authorization, scoped to a different conflict, is refused —
    // never silently reused. B degrades to the ordinary gate-ceiling fallback.
    expect(rulingB!.intervention.kind).not.toBe("halt");
    expect(rulingB!.rule).toBe("gate-ceiling");
    expect(rulingB!.escalationRecommended).toBe(true);
    expect(rulingB!.evidence.humanAuthorizationMatched).toBe(false);
  });

  it("with no authorization supplied at all, neither conflict ever reaches a forced halt", () => {
    const conflictA = conflict("undeclared-access", "resource-a", ["agent-a"], "conflict-A");
    const conflictB = conflict("undeclared-access", "resource-b", ["agent-b"], "conflict-B");

    const rulings = arbitrate(
      [conflictA, conflictB],
      [availableSet(["observe", "warn"]), availableSet(["observe", "warn"])],
      ["corrupting", "corrupting"],
      [],
    );

    for (const ruling of rulings) {
      expect(ruling.intervention.kind).not.toBe("halt");
      expect(ruling.escalationRecommended).toBe(true);
    }
  });
});
