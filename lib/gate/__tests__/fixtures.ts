/** Shared test-only builders for this milestone — same convention `lib/conflict/__tests__/fixtures.ts` already uses: small, obvious defaults a test overrides only the field it cares about. */
import { agentId, checkpointId, resourceId } from "../../contracts/ids.js";
import { timestamp } from "../../contracts/timestamp.js";
import type { Corroboration } from "../../contracts/corroboration.js";
import type { ResourceClaim, ResourceClaimMode } from "../../contracts/resource-claim.js";
import type { CheckpointDeclaration } from "../../contracts/checkpoint-declaration.js";

export function buildClaim(
  opts: {
    readonly agent?: string;
    readonly resource?: string;
    readonly mode?: ResourceClaimMode;
    readonly declaredAt?: string;
    readonly ttl?: number;
    readonly corroboration?: Corroboration;
  } = {},
): ResourceClaim {
  return {
    agentId: agentId(opts.agent ?? "agent-a"),
    resourceId: resourceId(opts.resource ?? "resource-1"),
    mode: opts.mode ?? "exclusive",
    declaredAt: timestamp(opts.declaredAt ?? "2026-09-22T00:00:00.000Z"),
    ttl: opts.ttl ?? 60_000,
    corroboration: opts.corroboration ?? "self-reported",
  };
}

export function buildCheckpoint(
  opts: {
    readonly reachable?: boolean;
    readonly resumable?: boolean;
    readonly id?: string;
    readonly declaredAt?: string;
  } = {},
): CheckpointDeclaration {
  return {
    reachable: opts.reachable ?? true,
    resumable: opts.resumable ?? true,
    checkpointId: checkpointId(opts.id ?? "checkpoint-1"),
    declaredAt: timestamp(opts.declaredAt ?? "2026-09-22T00:00:00.000Z"),
  };
}
