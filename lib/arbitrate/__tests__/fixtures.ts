/**
 * Shared test-only builders for this milestone, matching
 * `lib/gate/__tests__/fixtures.ts`'s and `lib/conflict/__tests__/
 * fixtures.ts`'s own convention: small, obvious defaults a test overrides
 * only the field it cares about. The seeded PRNG is a fresh copy of
 * `lib/conflict/__tests__/fixtures.ts`'s own `mulberry32`/`shuffle`, not an
 * import from it — `lib/conflict/**`'s own `__tests__/` directory is not
 * re-exported anywhere `lib/conflict/index.ts` (its own public surface)
 * would carry it, and reaching into a sibling module's private test
 * directory would be exactly the kind of cross-milestone coupling this
 * codebase's own layered `lib/contracts` → `lib/conflict` → `lib/gate` →
 * `lib/arbitrate` discipline (`.genesis/PLAN.md` §3) avoids everywhere
 * else. ~10 lines duplicated once is cheaper than a new coupling.
 */
import { agentId, checkpointId, conflictId, resourceClaimId, resourceId } from "../../contracts/ids.js";
import type { AgentId, ConflictId, ResourceId } from "../../contracts/ids.js";
import type { HumanId } from "../../contracts/human-id.js";
import type { Conflict } from "../../contracts/conflict.js";
import type { NonEmptyArray } from "../../contracts/non-empty-array.js";
import { isNonEmptyArray } from "../../contracts/non-empty-array.js";
import type { DetectedConflict } from "../../conflict/detected-conflict.js";
import { deriveConflictId } from "../../conflict/detected-conflict.js";
import type { AvailableInterventionKind, AvailableInterventionSet } from "../../gate/available-interventions.js";
import type { ArbitrationParticipant } from "../arbitration-participant.js";
import type { HumanAuthorization } from "../human-authorization.js";

export function conflict(kind: Conflict, resource: string, agents: readonly string[], id?: string): DetectedConflict {
  const participants = agents.map((a) => agentId(a));
  if (!isNonEmptyArray(participants)) {
    throw new Error("conflict() fixture requires at least one agent");
  }
  const rid = resourceId(resource);
  return {
    id: id !== undefined ? conflictId(id) : deriveConflictId(kind, rid, participants),
    kind,
    resourceId: rid,
    agentIds: participants,
  };
}

export function participant(
  agent: string,
  resource: string,
  claim: string,
  opts: { readonly checkpoint?: string } = {},
): ArbitrationParticipant {
  const base: ArbitrationParticipant = {
    agentId: agentId(agent),
    resourceId: resourceId(resource),
    claimId: resourceClaimId(claim),
  };
  return opts.checkpoint !== undefined ? { ...base, checkpointId: checkpointId(opts.checkpoint) } : base;
}

export function availableSet(kinds: readonly AvailableInterventionKind[]): AvailableInterventionSet {
  return new Set(kinds);
}

/**
 * `raw` is cast into `HumanId` here, in a TEST file, matching
 * `lib/contracts/human-id.ts`'s own documented exemption: "Test fixtures
 * are the sole exception... not the 'engine minted its own authorization'
 * failure mode this test exists to catch." Nothing under `lib/arbitrate/**`'s
 * own non-test source ever performs this cast — that is exactly what
 * `__tests__/no-self-authorized-force.test.ts` checks.
 */
export function humanAuthorization(rawHuman: string, forConflict: ConflictId): HumanAuthorization {
  return { authorizedBy: rawHuman as HumanId, conflictId: forConflict };
}

export function nonEmptyClaims(ids: readonly string[]): NonEmptyArray<ReturnType<typeof resourceClaimId>> {
  const mapped = ids.map((raw) => resourceClaimId(raw));
  if (!isNonEmptyArray(mapped)) {
    throw new Error("nonEmptyClaims() fixture requires at least one id");
  }
  return mapped;
}

/** `mulberry32` — a tiny, deterministic 32-bit PRNG. Same seed, same sequence, every run/machine. Copied from `lib/conflict/__tests__/fixtures.ts` — see this file's own header for why a copy, not an import. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  const value = items[Math.floor(rand() * items.length)];
  if (value === undefined) {
    throw new Error("pick() fixture requires a non-empty items array");
  }
  return value;
}

/** Every legal `AvailableInterventionKind`, for the property-based generator — kept as a plain local constant (not imported from `lib/gate`'s own `ALL_AVAILABLE_INTERVENTION_KINDS`) so this file's own `pick`/subset-generation logic is exercised against a list this test suite owns and can see drift against independently. */
export const ALL_KINDS: readonly AvailableInterventionKind[] = ["observe", "warn", "pause", "halt-checkpointed", "quarantine"];

/** A random, non-empty-guaranteed subset of `ALL_KINDS` that ALWAYS includes `"observe"` and `"warn"` — matching the real `availableInterventions`' own unconditional baseline (`lib/gate/available-interventions.ts`), so generated fixtures stay inside this milestone's own documented precondition on `available` (see `arbitrate.ts`'s own header). */
export function randomAvailableSet(rand: () => number): AvailableInterventionSet {
  const kinds = new Set<AvailableInterventionKind>(["observe", "warn"]);
  for (const kind of ["pause", "halt-checkpointed", "quarantine"] as const) {
    if (rand() < 0.5) kinds.add(kind);
  }
  return kinds;
}

export function randomAgentIds(rand: () => number, pool: readonly string[]): NonEmptyArray<AgentId> {
  const count = 1 + Math.floor(rand() * pool.length);
  const shuffled = pool.slice().sort(() => rand() - 0.5);
  const chosen = shuffled.slice(0, count).map((a) => agentId(a));
  if (!isNonEmptyArray(chosen)) {
    throw new Error("Unreachable: count >= 1 guarantees a non-empty selection");
  }
  return chosen;
}

export type { ResourceId };
