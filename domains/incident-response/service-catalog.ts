import type { ResourceId } from "../../lib/contracts/index.js";

/**
 * `BlastRadius` — this domain's own, disclosed policy vocabulary for "how
 * much of the incident-response surface a given production service
 * touches if this collision goes wrong." `lib/contracts/conflict-
 * severity.ts`'s own header states `ConflictSeverity` is "computed from
 * the conflicting resource's declared blast radius and the conflict
 * kind" — but no frozen contract, and no engine milestone (M3/M4/M5),
 * ever defines what "blast radius" actually is or computes one. That is
 * this milestone's own gap to close, the identical "the plan names a
 * concept it never fixes a shape for" pattern `lib/conflict/heartbeat.ts`
 * and `lib/arbitrate/human-authorization.ts` already closed for
 * `Heartbeat` and `HumanAuthorization` — owned here, in `domains/
 * incident-response/**`, the first (and only) milestone that actually
 * needs a real value to compute a real `ConflictSeverity` against.
 *
 * A closed 3-value enum, not a number — the identical "a named category a
 * human reviewer can dispute, not a score nobody can argue with" reasoning
 * `ConflictSeverity` itself already applies (see that file's header),
 * re-applied here one layer down for the input that feeds it.
 */
export type BlastRadius = "small" | "medium" | "large";

/**
 * THE CATALOG, STATED ONCE AS A DISCLOSED POLICY TABLE — NOT EVIDENCE-
 * BACKED, THE SAME HONESTY `lib/gate/clock.ts`'s `STALENESS_BOUND_MS` and
 * `lib/arbitrate/severity-ladder.ts`'s `SEVERITY_MINIMUM_RUNG` already
 * disclose for their own invented policy constants. This repository has
 * no real production-incident corpus to derive "how much blast radius
 * does checkout-service actually have" from; these five services and
 * their assigned radii exist to give this milestone's own scenario
 * (`scenario.ts`) realistic, domain-shaped objects to collide, not to
 * claim domain expertise this project does not have.
 *
 *   - `checkout-service` (large)         — directly serves paying
 *                                            customers; a bad rollback or
 *                                            scale-up here can corrupt
 *                                            live transactions.
 *   - `session-cache` (medium)            — shared session state; a bad
 *                                            write/read race can serve a
 *                                            user someone else's session,
 *                                            contained to the cache layer.
 *   - `feature-flag-config` (medium)      — a bad write here changes
 *                                            behavior for every request
 *                                            hitting the flag, contained
 *                                            to whatever that flag gates.
 *   - `internal-metrics-store` (small)    — observability data only; a
 *                                            collision here cannot affect
 *                                            a real customer request.
 *   - `diagnostic-log-bucket` (small)     — same reasoning as the metrics
 *                                            store; used by this
 *                                            milestone's own
 *                                            `undeclared-access` scenario.
 */
const SERVICE_CATALOG: ReadonlyMap<string, BlastRadius> = new Map([
  ["checkout-service", "large"],
  ["session-cache", "medium"],
  ["feature-flag-config", "medium"],
  ["internal-metrics-store", "small"],
  ["diagnostic-log-bucket", "small"],
]);

/**
 * Looks up a resource's declared blast radius. Throws on an unknown
 * resource — the same "caller-contract violation, fail loudly" discipline
 * `lib/arbitrate/arbitrate.ts`'s own length/duplicate-id preconditions
 * already use (`.genesis/decisions/0005-arbitration.md`): an unrecognized
 * `ResourceId` reaching this function means this domain's own scenario
 * wiring named a resource it never catalogued, which is a bug in this
 * milestone's own code, not adversarial input this function needs to
 * degrade gracefully against — no engine milestone downstream of M3 ever
 * calls this function with attacker-controlled input, it exists purely to
 * feed `computeSeverity` (`severity-policy.ts`) from this milestone's own,
 * fixed scenario data.
 */
export function blastRadiusOf(resource: ResourceId): BlastRadius {
  const found = SERVICE_CATALOG.get(String(resource));
  if (found === undefined) {
    throw new Error(
      `blastRadiusOf: no catalog entry for resource "${String(resource)}" — this domain's SERVICE_CATALOG (service-catalog.ts) must name every resource its own scenario ever claims or heartbeats against.`,
    );
  }
  return found;
}

/** Every resource this domain's catalog names — for tests that need to enumerate it without duplicating the map above. */
export const ALL_CATALOGED_RESOURCES: readonly string[] = [...SERVICE_CATALOG.keys()];
