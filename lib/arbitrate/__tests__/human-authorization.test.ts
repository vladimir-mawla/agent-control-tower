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

/**
 * L4 VERIFY REPORTED A LIVE BYPASS OF THE PROPERTY ABOVE: two conflicts
 * that are genuinely different collisions (different `kind`, different
 * `resourceId`, different `agentIds`) but that a caller — not M3's own
 * `deriveConflictId`, which cannot produce this shape — handed to
 * `arbitrate` sharing the SAME `ConflictId` string. `matchesConflict` is
 * pure string equality on `conflictId`, so an authorization scoped to one
 * of them matched BOTH, and both fired `halt`/`forced`. See
 * `.genesis/decisions/0005-arbitration.md` Decision 8 for why this is
 * fixed as a fail-closed INPUT precondition inside `arbitrate` itself
 * (every conflict in one batch must have a unique id), not by teaching
 * `matchesConflict` to also compare `resourceId`/`agentIds`.
 */
describe("arbitrate — a batch with a duplicate conflict id is refused outright, never silently arbitrated (the reported bypass, reproduced verbatim)", () => {
  it("REGRESSION: two genuinely different conflicts sharing one ConflictId string used to both fire halt/forced off a single authorization — now refused before either is ruled on", () => {
    const c1 = conflict("write-write", "resource-1", ["agent-a"], "shared-id");
    const c2 = conflict("undeclared-access", "resource-2", ["agent-b"], "shared-id");
    const auth = humanAuthorization("human-1", c1.id);

    expect(() =>
      arbitrate(
        [c1, c2],
        [availableSet(["observe", "warn"]), availableSet(["observe", "warn"])],
        ["corrupting", "corrupting"],
        [],
        auth,
      ),
    ).toThrow(/duplicate conflict id/i);
  });

  it("a duplicate id is refused even with no humanAuthorization in play at all — this is a batch-shape precondition, not merely an authorization guard", () => {
    const c1 = conflict("write-write", "resource-1", ["agent-a"], "shared-id");
    const c2 = conflict("undeclared-access", "resource-2", ["agent-b"], "shared-id");

    expect(() =>
      arbitrate([c1, c2], [availableSet(["observe", "warn"]), availableSet(["observe", "warn"])], ["corrupting", "corrupting"], []),
    ).toThrow(/duplicate conflict id/i);
  });

  it("three conflicts with only two sharing an id are still refused, naming the offending id", () => {
    const c1 = conflict("write-write", "resource-1", ["agent-a"], "id-x");
    const c2 = conflict("write-read", "resource-2", ["agent-b"], "id-y");
    const c3 = conflict("undeclared-access", "resource-3", ["agent-c"], "id-x");

    expect(() =>
      arbitrate(
        [c1, c2, c3],
        [availableSet(["observe", "warn"]), availableSet(["observe", "warn"]), availableSet(["observe", "warn"])],
        ["benign", "benign", "benign"],
        [],
      ),
    ).toThrow(/id-x/);
  });

  it("distinct ids across genuinely different conflicts are unaffected — the precondition never fires on the ordinary, non-colliding case", () => {
    const conflictA = conflict("undeclared-access", "resource-a", ["agent-a"], "conflict-A");
    const conflictB = conflict("undeclared-access", "resource-b", ["agent-b"], "conflict-B");
    expect(() =>
      arbitrate([conflictA, conflictB], [availableSet(["observe", "warn"]), availableSet(["observe", "warn"])], ["benign", "benign"], []),
    ).not.toThrow();
  });
});
