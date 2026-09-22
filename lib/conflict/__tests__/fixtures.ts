/**
 * Shared test fixtures and a small, hand-rolled seeded PRNG + Fisher-Yates
 * shuffle for this milestone's property-based order-independence tests.
 *
 * WHY A HAND-ROLLED PRNG, NOT A LIBRARY (e.g. `fast-check`): adding any
 * new package requires `npm install` to update `package-lock.json` before
 * `npm ci` can install it — the exact command this repo's own README/CI
 * discipline (`.genesis/PLAN.md` §6) warns is where npm 11.5.1 silently
 * drops the platform-specific `@rolldown/binding-*` package Vitest needs,
 * with no error pointing at the install as the cause. It would also
 * require adding a new specifier to `lib/contracts/__tests__/
 * import-containment.test.ts`'s `ALLOWED_EXTERNAL_SPECIFIERS` — a
 * deliberate widening of a security boundary this milestone's own task
 * says to call out prominently, not slip in for test convenience. A
 * seeded `mulberry32` generator is ~10 lines, deterministic (a failing
 * property test prints a reproducible seed), and needs neither.
 */
import { agentId, resourceId } from "../../contracts/ids.js";
import { timestamp } from "../../contracts/timestamp.js";
import type { ResourceClaim, ResourceClaimMode } from "../../contracts/resource-claim.js";
import type { Heartbeat } from "../heartbeat.js";

export function claim(
  agent: string,
  resource: string,
  mode: ResourceClaimMode,
  opts: { readonly declaredAt?: string; readonly ttl?: number } = {},
): ResourceClaim {
  return {
    agentId: agentId(agent),
    resourceId: resourceId(resource),
    mode,
    declaredAt: timestamp(opts.declaredAt ?? "2026-01-01T00:00:00.000Z"),
    ttl: opts.ttl ?? 60_000,
    corroboration: "self-reported",
  };
}

export function heartbeat(agent: string, resource: string, at = "2026-01-01T00:00:00.000Z"): Heartbeat {
  return { agentId: agentId(agent), resourceId: resourceId(resource), at: timestamp(at) };
}

/** `mulberry32` — a tiny, deterministic 32-bit PRNG. Same seed, same sequence, every run/machine. */
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

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}
