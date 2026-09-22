import { describe, expect, it } from "vitest";
import { detectConflicts } from "../detect-conflicts.js";
import { claim, heartbeat, mulberry32 } from "./fixtures.js";

/**
 * Plan §4 M3, "what it refuses": "to treat an agent re-declaring the
 * identical claim as a second conflict (idempotence)." Read at its
 * fullest: idempotence here means two distinct things, both proven below
 * — (1) calling `detectConflicts` twice on the SAME input produces a
 * deep-equal result (true of any pure function, but worth proving for
 * real rather than asserting from "it's pure" alone — see
 * `detect-conflicts.ts`'s own header for why nothing after the initial
 * safe-extraction step can throw or vary), and (2) FEEDING duplicate
 * claims/heartbeats does not inflate the conflict count, which is the
 * plan's own literal wording and is proven structurally by the
 * `Set`-based grouping in `detect-conflicts.ts` (`groupClaimsByResource`,
 * `buildClaimedPairs`), not by a dedup pass bolted on after the fact.
 */
describe("detectConflicts — running twice on the same input", () => {
  it("produces a deep-equal DetectionResult both times, for a scenario with real conflicts", () => {
    const claims = [
      claim("agent-a", "res-1", "exclusive"),
      claim("agent-b", "res-1", "exclusive"),
      claim("agent-c", "res-2", "write"),
    ];
    const heartbeats = [heartbeat("agent-d", "res-3")];
    const first = detectConflicts(claims, heartbeats);
    const second = detectConflicts(claims, heartbeats);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.conflicts.length).toBeGreaterThan(0);
  });

  it("holds across 200 randomly generated scenarios, not just one hand-picked one", () => {
    for (let seed = 0; seed < 200; seed++) {
      const rand = mulberry32(seed * 97 + 3);
      const claims = Array.from({ length: Math.floor(rand() * 6) }, () =>
        claim(
          ["agent-a", "agent-b", "agent-c"][Math.floor(rand() * 3)]!,
          ["res-1", "res-2"][Math.floor(rand() * 2)]!,
          (["read", "write", "exclusive"] as const)[Math.floor(rand() * 3)]!,
        ),
      );
      const heartbeats = Array.from({ length: Math.floor(rand() * 4) }, () =>
        heartbeat(["agent-a", "agent-b", "agent-c"][Math.floor(rand() * 3)]!, ["res-1", "res-2"][Math.floor(rand() * 2)]!),
      );
      expect(detectConflicts(claims, heartbeats)).toEqual(detectConflicts(claims, heartbeats));
    }
  });
});

describe("detectConflicts — duplicate-claim/heartbeat storm does not inflate the conflict count", () => {
  it("50 identical exclusive claims from the same agent, plus one real second claimant, is still exactly one write-write conflict", () => {
    const duplicates = Array.from({ length: 50 }, () => claim("agent-a", "res-1", "exclusive"));
    const result = detectConflicts([...duplicates, claim("agent-b", "res-1", "exclusive")], []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
  });

  it("a scenario built from 50x-duplicated claims/heartbeats matches the equivalent de-duplicated scenario exactly, id included", () => {
    const dedupedClaims = [claim("agent-a", "res-1", "write"), claim("agent-b", "res-1", "read")];
    const dedupedHeartbeats = [heartbeat("agent-c", "res-2")];

    const stormClaims = Array.from({ length: 50 }, () => dedupedClaims).flat();
    const stormHeartbeats = Array.from({ length: 50 }, () => dedupedHeartbeats).flat();

    expect(detectConflicts(stormClaims, stormHeartbeats)).toEqual(detectConflicts(dedupedClaims, dedupedHeartbeats));
  });
});
