/**
 * `tests/failures/support.ts` — small, test-only builders for M7's failure
 * suite, matching the exact convention `lib/conflict/__tests__/fixtures.ts`,
 * `lib/gate/__tests__/fixtures.ts`, and `lib/arbitrate/__tests__/fixtures.ts`
 * already use in each frozen milestone: minimal, obvious defaults, one
 * field overridden at a time. Deliberately NOT imported from any of those
 * three directories — each one's `__tests__/` is that milestone's own
 * private test surface, never re-exported anywhere its own `index.ts`
 * would carry it (the identical "duplicate ~10 lines rather than couple to
 * a sibling's private tests" reasoning `lib/arbitrate/__tests__/fixtures.ts`'s
 * own header already states for the identical situation one layer down).
 * This file is M7's own copy, living inside `tests/failures/**` — the only
 * directory this milestone may write to at all (`lib/**`, `domains/**`,
 * `app/**`, and `components/**` are all frozen; `git diff main -- lib
 * domains app components` must stay empty for the whole of this milestone).
 *
 * Every builder here calls only the real, public, frozen API each engine
 * milestone exports from its own `index.ts` — nothing in this file
 * reaches into a private module path.
 */
import {
  agentId,
  resourceId,
  checkpointId,
  conflictId,
  resourceClaimId,
  timestamp,
  isNonEmptyArray,
  type AgentId,
  type Conflict,
  type ResourceClaim,
  type ResourceClaimMode,
  type Corroboration,
  type CheckpointDeclaration,
  type HumanId,
} from "../../lib/contracts/index.js";
import { deriveConflictId, type DetectedConflict, type Heartbeat } from "../../lib/conflict/index.js";
import type { ArbitrationParticipant, HumanAuthorization } from "../../lib/arbitrate/index.js";

/** A fixed instant every test in this suite anchors to, so no test is sensitive to the real wall clock. */
export const T0 = "2026-09-22T00:00:00.000Z";

/** `base` plus `ms` milliseconds, as an ISO string — for building "N vs N+1" and "much later" fixtures without hand-computing dates. */
export function plusMs(base: string, ms: number): string {
  return new Date(Date.parse(base) + ms).toISOString();
}

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
    declaredAt: timestamp(opts.declaredAt ?? T0),
    ttl: opts.ttl ?? 60_000,
    corroboration: opts.corroboration ?? "self-reported",
  };
}

export function buildHeartbeat(opts: { readonly agent?: string; readonly resource?: string; readonly at?: string } = {}): Heartbeat {
  return {
    agentId: agentId(opts.agent ?? "agent-a"),
    resourceId: resourceId(opts.resource ?? "resource-1"),
    at: timestamp(opts.at ?? T0),
  };
}

export function buildCheckpoint(
  opts: { readonly reachable?: boolean; readonly resumable?: boolean; readonly id?: string; readonly declaredAt?: string } = {},
): CheckpointDeclaration {
  return {
    reachable: opts.reachable ?? true,
    resumable: opts.resumable ?? true,
    checkpointId: checkpointId(opts.id ?? "checkpoint-1"),
    declaredAt: timestamp(opts.declaredAt ?? T0),
  };
}

/** Builds a `DetectedConflict` directly (rather than deriving one from `detectConflicts`), for cases that need to hand `arbitrate` a specific, hand-shaped conflict — e.g. two conflicts sharing an id on purpose (case 12). `id` defaults to the real, deterministic `deriveConflictId` (the frozen, `lib/conflict`-owned minting function), never a second, ad hoc scheme. */
export function buildConflict(kind: Conflict, resource: string, agents: readonly string[], idOverride?: string): DetectedConflict {
  const participants = agents.map((a) => agentId(a));
  if (!isNonEmptyArray(participants)) {
    throw new Error("buildConflict() fixture requires at least one agent");
  }
  const rid = resourceId(resource);
  return {
    id: idOverride !== undefined ? conflictId(idOverride) : deriveConflictId(kind, rid, participants),
    kind,
    resourceId: rid,
    agentIds: participants,
  };
}

export function buildParticipant(
  agent: string,
  resource: string,
  claimIdRaw: string,
  opts: { readonly checkpoint?: string } = {},
): ArbitrationParticipant {
  const base: ArbitrationParticipant = { agentId: agentId(agent), resourceId: resourceId(resource), claimId: resourceClaimId(claimIdRaw) };
  return opts.checkpoint !== undefined ? { ...base, checkpointId: checkpointId(opts.checkpoint) } : base;
}

/**
 * `rawHuman` is cast into `HumanId` here, in a TEST file — matching
 * `lib/contracts/human-id.ts`'s own documented exemption: "Test fixtures
 * are the sole exception... not the 'engine minted its own authorization'
 * failure mode this test exists to catch." Several of this suite's own
 * cases (3, 5, 9, 10) deliberately use this to construct a HUMAN
 * AUTHORIZATION THIS SUITE ITSELF KNOWS IS FORGED — that is the entire
 * point of those cases (pinning "a caller can forge a HumanAuthorization
 * outside `lib/`" — ADR 0006 Decision 4b), not an accidental misuse of the
 * exemption.
 */
export function buildHumanAuth(rawHuman: string, forConflict: string): HumanAuthorization {
  return { authorizedBy: rawHuman as HumanId, conflictId: conflictId(forConflict) };
}

export type { AgentId };
