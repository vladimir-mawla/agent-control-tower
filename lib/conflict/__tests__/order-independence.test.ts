import { describe, expect, it } from "vitest";
import { detectConflicts } from "../detect-conflicts.js";
import { claim, heartbeat, mulberry32, shuffle } from "./fixtures.js";
import type { ResourceClaim, ResourceClaimMode } from "../../contracts/resource-claim.js";
import type { Heartbeat } from "../heartbeat.js";

/**
 * Plan §4 M3's own falsifiability check, verbatim: "A verifier feeds the
 * same claim set in every permutation and asserts deep-equal `Conflict[]`
 * output across all permutations (a real order-independence proof, not a
 * single fixed-order example)." This file is that proof, done two ways:
 * (1) EVERY permutation of a small, fixed 4-claim scenario (4! = 24,
 * exhaustive, not sampled), and (2) a property-based sweep over many
 * RANDOMLY GENERATED scenarios, each checked against several random
 * shuffles, using a seeded PRNG (`fixtures.ts`) so a failure is
 * reproducible by its printed seed — the milestone's own task explicitly
 * asks for "a property-based approach over generated inputs rather than
 * a handful of fixtures," and a fixed scenario alone would not exercise
 * cases this milestone's author didn't think to hand-write.
 */

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const [head, ...rest] = items;
  const subPerms = permutations(rest);
  const result: T[][] = [];
  for (const perm of subPerms) {
    for (let i = 0; i <= perm.length; i++) {
      result.push([...perm.slice(0, i), head as T, ...perm.slice(i)]);
    }
  }
  return result;
}

describe("detectConflicts — exhaustive permutation proof (fixed scenario)", () => {
  it("every one of the 4! = 24 orderings of a 4-claim, 2-resource scenario (write-write + write-read together) produces the identical result", () => {
    const claims = [
      claim("agent-a", "res-1", "exclusive"),
      claim("agent-b", "res-1", "exclusive"),
      claim("agent-c", "res-2", "write"),
      claim("agent-d", "res-2", "read"),
    ];
    const baseline = detectConflicts(claims, []);
    expect(baseline.ok).toBe(true);

    const allOrderings = permutations(claims);
    expect(allOrderings).toHaveLength(24);
    for (const ordering of allOrderings) {
      expect(detectConflicts(ordering, [])).toEqual(baseline);
    }
  });

  it("every one of the 3! = 6 orderings of 3 heartbeats (mixed declared/undeclared) produces the identical result", () => {
    const claims = [claim("agent-a", "res-1", "read")];
    const heartbeats = [heartbeat("agent-a", "res-1"), heartbeat("agent-b", "res-1"), heartbeat("agent-c", "res-2")];
    const baseline = detectConflicts(claims, heartbeats);
    for (const ordering of permutations(heartbeats)) {
      expect(detectConflicts(claims, ordering)).toEqual(baseline);
    }
  });

  it("a SIMULTANEOUS tie — two exclusive claims with the identical declaredAt — is order-independent too (failure-suite case 1, proven here for M3's own detection layer)", () => {
    const a = claim("agent-a", "res-1", "exclusive", { declaredAt: "2026-06-01T00:00:00.000Z" });
    const b = claim("agent-b", "res-1", "exclusive", { declaredAt: "2026-06-01T00:00:00.000Z" });
    const forward = detectConflicts([a, b], []);
    const backward = detectConflicts([b, a], []);
    expect(forward).toEqual(backward);
    expect(forward.ok).toBe(true);
    if (!forward.ok) throw new Error("unreachable");
    expect(forward.conflicts).toHaveLength(1);
  });
});

const AGENTS = ["agent-a", "agent-b", "agent-c", "agent-d"] as const;
const RESOURCES = ["res-1", "res-2"] as const;
const MODES: readonly ResourceClaimMode[] = ["read", "write", "exclusive"];

function randomClaim(rand: () => number): ResourceClaim {
  const agent = AGENTS[Math.floor(rand() * AGENTS.length)]!;
  const resource = RESOURCES[Math.floor(rand() * RESOURCES.length)]!;
  const mode = MODES[Math.floor(rand() * MODES.length)]!;
  // declaredAt is deliberately randomized independently of everything
  // else, including sometimes being "reversed" relative to array order —
  // detectConflicts must never read it (see detect-conflicts.ts's own
  // header), so randomizing it must never change the result.
  const declaredAt = new Date(Date.UTC(2020, 0, 1) + Math.floor(rand() * 1_000_000_000)).toISOString();
  return claim(agent, resource, mode, { declaredAt, ttl: Math.floor(rand() * 100_000) });
}

function randomHeartbeat(rand: () => number): Heartbeat {
  const agent = AGENTS[Math.floor(rand() * AGENTS.length)]!;
  const resource = RESOURCES[Math.floor(rand() * RESOURCES.length)]!;
  const at = new Date(Date.UTC(2020, 0, 1) + Math.floor(rand() * 1_000_000_000)).toISOString();
  return heartbeat(agent, resource, at);
}

describe("detectConflicts — property-based order-independence over randomly generated scenarios", () => {
  const SCENARIOS = 150;
  const SHUFFLES_PER_SCENARIO = 5;

  for (let scenarioIndex = 0; scenarioIndex < SCENARIOS; scenarioIndex++) {
    it(`scenario seed=${scenarioIndex}: any shuffle of a randomly generated claim/heartbeat set produces the exact same DetectionResult`, () => {
      const genRand = mulberry32(scenarioIndex * 7919 + 13);
      const claimCount = Math.floor(genRand() * 8);
      const heartbeatCount = Math.floor(genRand() * 6);
      const claims = Array.from({ length: claimCount }, () => randomClaim(genRand));
      const heartbeats = Array.from({ length: heartbeatCount }, () => randomHeartbeat(genRand));

      const baseline = detectConflicts(claims, heartbeats);
      expect(baseline.ok).toBe(true);

      for (let shuffleIndex = 0; shuffleIndex < SHUFFLES_PER_SCENARIO; shuffleIndex++) {
        const shuffleRand = mulberry32(scenarioIndex * 104_729 + shuffleIndex * 31 + 1);
        const shuffledClaims = shuffle(claims, shuffleRand);
        const shuffledHeartbeats = shuffle(heartbeats, shuffleRand);
        const shuffled = detectConflicts(shuffledClaims, shuffledHeartbeats);
        expect(shuffled).toEqual(baseline);
      }
    });
  }

  it("sanity: the random generator above actually produces at least one scenario with a non-empty conflict set (a passing suite isn't vacuously trivial)", () => {
    let sawAtLeastOneConflict = false;
    for (let scenarioIndex = 0; scenarioIndex < SCENARIOS; scenarioIndex++) {
      const genRand = mulberry32(scenarioIndex * 7919 + 13);
      const claimCount = Math.floor(genRand() * 8);
      const heartbeatCount = Math.floor(genRand() * 6);
      const claims = Array.from({ length: claimCount }, () => randomClaim(genRand));
      const heartbeats = Array.from({ length: heartbeatCount }, () => randomHeartbeat(genRand));
      const result = detectConflicts(claims, heartbeats);
      if (result.ok && result.conflicts.length > 0) {
        sawAtLeastOneConflict = true;
        break;
      }
    }
    expect(sawAtLeastOneConflict).toBe(true);
  });
});
