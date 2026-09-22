/**
 * Opaque branded identity tokens shared across this milestone's contracts:
 * `AgentId`, `ResourceId`, `ResourceClaimId`, `CheckpointId`, `ConflictId`.
 * Kept in one file, deliberately unlike memory-ledger's `MemoryId` (its own
 * leaf file) and `TombstoneId` (its own leaf file): that split there was
 * forced by a real import cycle (`tombstone.ts` needs `MemoryId`,
 * `memory.ts` needs `Tombstone`, and neither file can import the other).
 * No such cycle exists among these five tokens or their consumers here, so
 * splitting them into five near-identical one-symbol files would be
 * sprawl without a reason, not a virtue in itself.
 *
 * `HumanId` is NOT here — see `human-id.ts` for why it is a brand with
 * deliberately no minting function at all, unlike the five below.
 *
 * WHY BRANDED, NOT BARE `string`: the same reasoning `memory-id.ts`
 * documents — a bare `string` field would let an `AgentId` be handed
 * wherever a `ResourceId` or `CheckpointId` is expected, silently, at every
 * call site from M3 onward. Each brand stops that at the type level.
 *
 * NO PARSERS: like `MemoryId`, none of these five carries an invariant
 * beyond "is a string" — they are opaque identity tokens (a UUID, a ULID,
 * whatever a real store eventually generates), not values with a range or
 * a grammar to validate. Each gets a minting function that owns only the
 * brand, matching `memory-id.ts`'s own `memoryId()`. Real generation
 * strategy (how M3/M4/M5 actually produce these ids for a live claim or
 * conflict) is deliberately undecided here — see `.genesis/decisions/
 * 0001-contracts.md` for why that is a deferred question, not an oversight.
 */

declare const agentIdBrand: unique symbol;
export type AgentId = string & { readonly [agentIdBrand]: "AgentId" };
export function agentId(raw: string): AgentId {
  return raw as AgentId;
}

declare const resourceIdBrand: unique symbol;
export type ResourceId = string & { readonly [resourceIdBrand]: "ResourceId" };
export function resourceId(raw: string): ResourceId {
  return raw as ResourceId;
}

declare const resourceClaimIdBrand: unique symbol;
export type ResourceClaimId = string & { readonly [resourceClaimIdBrand]: "ResourceClaimId" };
export function resourceClaimId(raw: string): ResourceClaimId {
  return raw as ResourceClaimId;
}

declare const checkpointIdBrand: unique symbol;
export type CheckpointId = string & { readonly [checkpointIdBrand]: "CheckpointId" };
export function checkpointId(raw: string): CheckpointId {
  return raw as CheckpointId;
}

declare const conflictIdBrand: unique symbol;
export type ConflictId = string & { readonly [conflictIdBrand]: "ConflictId" };
export function conflictId(raw: string): ConflictId {
  return raw as ConflictId;
}
