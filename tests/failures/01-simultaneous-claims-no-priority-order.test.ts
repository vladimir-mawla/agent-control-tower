import { describe, expect, it } from "vitest";
import { detectConflicts } from "../../lib/conflict/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { buildClaim, buildConflict, buildParticipant, plusMs, T0 } from "./support.js";

/**
 * FAILURE CASE 1 — plan §5 sketch case 1 ("simultaneous exclusive claims,
 * a tie"), KEPT but re-scoped after reading `detect-conflicts.ts` and its
 * own ADR (`.genesis/decisions/0003-detection.md` Decision 4) directly.
 *
 * THE SKETCH, AS WRITTEN, IS ALMOST A REGRESSION TEST: "two agents claim
 * exclusive on the same resource with identical timestamps — must produce
 * a defined write-write conflict, never silently favor one claim, never
 * throw" is exactly what M3's own `order-independence.test.ts` already
 * proves over 150 random scenarios. Restating it here would be a happy
 * path wearing a failure's clothes, not a new limit.
 *
 * THE REAL LIMIT THIS CASE ACTUALLY PINS: `detectConflicts` doesn't merely
 * survive a tie without favoring one side — it is structurally INCAPABLE
 * of expressing anything OTHER than a tie. `declaredAt` is never read by
 * this function at all (confirmed by reading `detect-conflicts.ts`
 * directly: `SafeClaim` extracts only `agentId`/`resourceId`/`mode`).
 * There is no code path, anywhere between detection and the final
 * `InterventionRuling`, that could ever answer "which agent actually
 * claimed this resource first" — not because ties are handled safely, but
 * because arrival order is thrown away before detection even begins. A
 * human arbitrating a genuine priority dispute gets zero evidence from
 * this system to break the tie with, deliberately or otherwise.
 *
 * WHAT WOULD MAKE THIS FAIL: `detectConflicts` starting to read
 * `declaredAt` to order `agentIds` by claim time (test 2 would then diverge
 * between the tied and staggered runs); or `DetectedConflict` /
 * `ArbitrationEvidence` gaining a timestamp/ordering field a caller could
 * read (test 3's key-enumeration would then need updating).
 */
describe("FAILURE CASE 1 — a tie is not a special case this system handles; it is the ONLY case this system can express", () => {
  it("baseline: two exclusive claims with identical declaredAt produce one well-defined write-write conflict, never throwing, never favoring one agent over the other", () => {
    const result = detectConflicts(
      [buildClaim({ agent: "agent-a", declaredAt: T0 }), buildClaim({ agent: "agent-b", declaredAt: T0 })],
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe("write-write");
    expect(result.conflicts[0]?.agentIds.map(String)).toEqual(["agent-a", "agent-b"]);
  });

  it("THE ACTUAL LIMIT, falsified against a contrast: a genuine tie and two claims declared a million milliseconds apart produce a BYTE-IDENTICAL result — there is no observable difference for detectConflicts to have gotten right or wrong, because arrival order was never captured in the first place", () => {
    const tied = detectConflicts(
      [buildClaim({ agent: "agent-a", declaredAt: T0 }), buildClaim({ agent: "agent-b", declaredAt: T0 })],
      [],
    );
    const staggered = detectConflicts(
      [buildClaim({ agent: "agent-a", declaredAt: T0 }), buildClaim({ agent: "agent-b", declaredAt: plusMs(T0, 1_000_000) })],
      [],
    );
    expect(tied).toEqual(staggered);
  });

  it("the blindness survives all the way to the final ruling: ArbitrationEvidence has no field that could ever carry 'who was first', by construction, not by omission this test merely didn't look for", () => {
    const conflict = buildConflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const available = new Set<"observe" | "warn">(["observe", "warn"]);
    const [ruling] = arbitrate(
      [conflict],
      [available],
      ["benign"],
      [buildParticipant("agent-a", "resource-1", "claim-a"), buildParticipant("agent-b", "resource-1", "claim-b")],
    );
    expect(ruling).toBeDefined();
    // The complete, real field list `ArbitrationEvidence` declares
    // (`lib/arbitrate/intervention-ruling.ts`): severity, availableKinds,
    // requiredMinimumRung, selectedRung, humanAuthorizationMatched. None
    // of the five is, or could be, a timestamp or an ordering fact.
    expect(Object.keys(ruling!.evidence).sort()).toEqual(
      ["availableKinds", "humanAuthorizationMatched", "requiredMinimumRung", "selectedRung", "severity"].sort(),
    );
  });
});
