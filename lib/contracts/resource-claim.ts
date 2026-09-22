import type { AgentId, ResourceId } from "./ids.js";
import type { Corroboration } from "./corroboration.js";
import type { Timestamp } from "./timestamp.js";

/**
 * `ResourceClaim.mode` — closed 3-value enum, never a free-text lock
 * description (plan §2): `"read" | "write" | "exclusive"`.
 */
export type ResourceClaimMode = "read" | "write" | "exclusive";

/**
 * `ResourceClaim` — an agent's own declaration that it holds some mode of
 * access to some resource (plan §2): `{ agentId, resourceId, mode,
 * declaredAt, ttl, corroboration }`, exactly the six fields the plan names,
 * no more.
 *
 * `ttl` is a plain `number` (milliseconds), not a branded type: unlike
 * `Confidence`'s provable `[0, 1]` range or `Corroboration`'s closed
 * vocabulary, the plan states no numeric invariant for `ttl` at this
 * milestone (no minimum, no required relationship to `declaredAt`) —
 * branding it here would be inventing a rule this milestone has no way to
 * validate is the right one. Whatever staleness arithmetic actually needs
 * from `ttl` is M4's job (`lib/gate/**`, unbuilt), where the real bound is
 * decided.
 *
 * `corroboration` sits ON the claim itself, not on a separate wrapper —
 * this is also what `CheckpointDeclaration` (checkpoint-declaration.ts)
 * relies on: that type carries no `corroboration` field of its own, by
 * design (see its own header), because M4's `availableInterventions(agent,
 * claim, checkpoint, now)` reads corroboration from the paired `claim`
 * argument, not from the checkpoint.
 *
 * NO `id` FIELD: see `conflict.ts`'s header for the identical gap on
 * `Conflict` and why it is deliberately left open rather than guessed at.
 * `ResourceClaimId` (ids.ts) exists as an opaque token so `Intervention`'s
 * `quarantine` variant can name "which claims to revoke," but nothing in
 * this milestone says a `ResourceClaim` value carries that id as one of
 * its own fields — whether it is minted at declaration time and stored
 * alongside, or derived later some other way, is left to whichever
 * milestone first needs to look a claim up by id (M4 or M5).
 */
export interface ResourceClaim {
  readonly agentId: AgentId;
  readonly resourceId: ResourceId;
  readonly mode: ResourceClaimMode;
  readonly declaredAt: Timestamp;
  readonly ttl: number;
  readonly corroboration: Corroboration;
}
