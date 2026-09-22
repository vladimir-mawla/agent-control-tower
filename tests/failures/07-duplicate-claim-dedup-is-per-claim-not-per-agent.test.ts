import { describe, expect, it } from "vitest";
import { detectConflicts } from "../../lib/conflict/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { buildClaim, buildConflict, buildParticipant } from "./support.js";

/**
 * FAILURE CASE 7 — plan §5 sketch case 8 ("duplicate claim storm... must
 * not produce 50 conflicts or 50 rulings"), kept but sharpened into a
 * genuinely new finding after tracing idempotence past M3's own settled
 * boundary.
 *
 * M3's OWN idempotence is real and already exhaustively proven
 * (`lib/conflict/__tests__/idempotence.test.ts`, 200 random scenarios,
 * plus a real sabotage-and-restore experiment in ADR 0003). Restating "50
 * identical claims produce 1 conflict" here would be a regression test —
 * the first sub-test below exists only to establish that baseline before
 * showing where it stops holding.
 *
 * THE ACTUAL, PREVIOUSLY-UNWRITTEN LIMIT: detection's own dedup is keyed
 * by `agentId` (`groupClaimsByResource`'s `Set<string>`, ADR 0003
 * Decision 5) — it cannot inflate no matter how many times one agent
 * re-declares. `arbitrate`'s own `claimIdsOf` (`lib/arbitrate/arbitrate.ts`)
 * dedups a completely different way: by the literal `ResourceClaimId`
 * STRING on each `ArbitrationParticipant`, never by `agentId`. ADR 0001
 * Decision 3 and ADR 0005 Decision 1 both leave the actual
 * claim-id-MINTING STRATEGY open — "depending on the caller's own
 * claim-tracking scheme." A perfectly reasonable scheme (mint a fresh id
 * every time an agent renews/re-declares its claim, to keep a real
 * audit trail of each individual declaration) means one agent re-declaring
 * its claim 50 times produces 50 DISTINCT `ArbitrationParticipant` records
 * for the SAME agent — and `claimIdsOf` will faithfully list all 50 in a
 * `quarantine`'s `revokedClaims`, because it has no idea two entries name
 * the same agent. The "duplicate claim storm" refusal M3 proves at
 * detection time does NOT propagate to the arbitration layer at all.
 *
 * WHAT WOULD MAKE THIS FAIL: `claimIdsOf` starting to dedup by `agentId`
 * instead of (or in addition to) `claimId` (sub-test 3 would then see
 * `revokedClaims.length === 1`, matching the contrast in sub-test 2).
 */
describe("FAILURE CASE 7 — one agent re-declaring its claim 50 times is invisible to detection, but not to a quarantine's own revocation list", () => {
  it("baseline (M3's own settled property, re-confirmed as the premise the rest of this case depends on): 50 identical re-declarations collapse to one conflict, not fifty", () => {
    const duplicated = Array.from({ length: 50 }, () => buildClaim({ agent: "agent-a" }));
    const result = detectConflicts([...duplicated, buildClaim({ agent: "agent-b" })], []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.agentIds.map(String)).toEqual(["agent-a", "agent-b"]);
  });

  it("contrast: when a caller's claim-tracking mints the SAME claimId for every re-declaration, quarantine correctly revokes exactly one claim", () => {
    const conflict = buildConflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const available = new Set<"observe" | "warn" | "quarantine">(["observe", "warn", "quarantine"]);
    const repeatedSameId = Array.from({ length: 50 }, () => buildParticipant("agent-a", "resource-1", "claim-agent-a-stable-id"));
    const [ruling] = arbitrate(
      [conflict],
      [available],
      ["corrupting"],
      [...repeatedSameId, buildParticipant("agent-b", "resource-1", "claim-b")],
    );
    if (ruling === undefined || ruling.intervention.kind !== "quarantine") throw new Error("expected a quarantine ruling");
    expect(ruling.intervention.revokedClaims).toHaveLength(2); // agent-a's one stable id, plus agent-b's
  });

  it("THE ACTUAL LIMIT: when a caller's claim-tracking mints a FRESH claimId for each of the SAME agent's 50 re-declarations, quarantine's revokedClaims lists all 50 — undeduplicated by agent, because claimIdsOf only ever dedups by the literal claimId string", () => {
    const conflict = buildConflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const available = new Set<"observe" | "warn" | "quarantine">(["observe", "warn", "quarantine"]);
    const freshIdEachTime = Array.from({ length: 50 }, (_, i) => buildParticipant("agent-a", "resource-1", `claim-agent-a-renewal-${i}`));
    const [ruling] = arbitrate(
      [conflict],
      [available],
      ["corrupting"],
      [...freshIdEachTime, buildParticipant("agent-b", "resource-1", "claim-b")],
    );
    if (ruling === undefined || ruling.intervention.kind !== "quarantine") throw new Error("expected a quarantine ruling");
    // 50 distinct ids for agent-a, all undeduplicated, plus agent-b's one — 51 total.
    expect(ruling.intervention.revokedClaims).toHaveLength(51);
  });
});
