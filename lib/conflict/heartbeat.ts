import type { AgentId, ResourceId } from "../contracts/ids.js";
import type { Timestamp } from "../contracts/timestamp.js";

/**
 * `Heartbeat` — NOT one of M1's six frozen contracts. `.genesis/PLAN.md`
 * §3's own pipeline diagram and §4's M3 signature both name
 * `Heartbeat[]` as one of `detectConflicts`'s two inputs
 * (`detectConflicts(claims: ResourceClaim[], heartbeats: Heartbeat[]):
 * Conflict[]`), and `.genesis/DONE.html` lists it among the typed inputs
 * a ruling is built from — but `lib/contracts/**` (frozen after M1,
 * `.genesis/decisions/0001-contracts.md`) never defines it. Grepped
 * directly to confirm this is a real gap, not a naming mismatch: `grep -rn
 * "Heartbeat" lib/` before this file existed returned nothing.
 *
 * This is a plan gap this milestone is the first to actually need closed,
 * the same shape `0001-contracts.md`'s own Decision 3 already names for
 * `Conflict`'s and `ResourceClaim`'s missing `id` fields: "left to
 * whichever milestone first needs to look one up... when it can verify
 * the answer against real code rather than a guess made before either
 * exists." `lib/contracts/**` stays frozen — this type is owned by
 * `lib/conflict/**` instead, not smuggled into the frozen directory.
 *
 * SHAPE CHOSEN, AND WHY IT STOPS HERE: plan §2's own definition of the
 * `undeclared-access` conflict kind is the only place the plan ever
 * describes what a heartbeat needs to carry for detection to use it: "a
 * heartbeat shows an agent touched a resource it never claimed." That
 * sentence needs exactly two identifying facts — which agent, which
 * resource — plus an instant the heartbeat was observed at, for the same
 * reason `ResourceClaim.declaredAt`/`CheckpointDeclaration.declaredAt`
 * both carry one (so a caller can reason about *when* later, even though
 * `detectConflicts` itself, see `detect-conflicts.ts`'s header, does not
 * compare `at` against anything). No `corroboration` field: plan §2 scopes
 * `Corroboration` to "how the tower came to know a fact about an agent,"
 * and a heartbeat's `Corroboration` level is a live-agent-communication
 * design question (does self-reported heartbeat data need this at all,
 * separate from cross-checking) that M3 has no engine downstream of it
 * yet to test the answer against — the exact "don't guess a field no
 * consumer needs yet" reasoning `0001-contracts.md` Decision 5 already
 * applies to `ResourceClaim.ttl`, re-applied here rather than reinvented.
 * If a later milestone needs `Heartbeat` to carry more, that milestone
 * extends this file (or moves the type up a level) and documents why in
 * its own ADR — the identical discipline this file itself is following
 * right now for `Conflict`/`ResourceClaim`.
 */
export interface Heartbeat {
  readonly agentId: AgentId;
  readonly resourceId: ResourceId;
  readonly at: Timestamp;
}
