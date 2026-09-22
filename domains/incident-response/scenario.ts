import {
  agentId,
  checkpointId,
  resourceClaimId,
  resourceId,
  timestamp,
  type AgentId,
  type CheckpointDeclaration,
  type ResourceClaim,
  type ResourceId,
  type Timestamp,
} from "../../lib/contracts/index.js";
import type { Heartbeat } from "../../lib/conflict/index.js";
import type { ArbitrationParticipant } from "../../lib/arbitrate/index.js";
import { blastRadiusOf } from "./service-catalog.js";
import { computeSeverity } from "./severity-policy.js";
import { combinedAvailableInterventions, noLegitimateClaimEvidence, type ClaimEvidence } from "./gate-aggregation.js";

/**
 * `scenario.ts` — one incident, three concurrent remediation agents,
 * realistic domain objects (real `ResourceClaim`/`CheckpointDeclaration`/
 * `Heartbeat` values with real ids, real timestamps, real corroboration
 * levels) rather than M3–M5's own contrived unit fixtures (each stage's
 * own `__tests__/fixtures.ts`). Plan §4 M6's own "what it refuses"
 * bullet, verbatim: "to let two remediation bots' conflicting claims on
 * the same service go undetected because they arrived through 'realistic,'
 * differently-shaped domain objects rather than the contrived fixtures
 * M3–M5's own unit tests use." This file is that proof: every value below
 * is a real `ResourceClaim`/`Heartbeat`/`CheckpointDeclaration`, and both
 * `scripts/demo-incident.ts` and this milestone's own
 * `__tests__/*.test.ts` run the SAME data through the SAME real
 * `detectConflicts`/`availableInterventions`/`arbitrate` pipeline — a
 * narration that could stay green while the wiring broke would mean these
 * tests broke too, since they read from this exact module.
 *
 * THE INCIDENT: three agents (`AutoScaler`, `RollbackBot`, `CacheFlusher`)
 * respond to one production incident and collide over five distinct
 * services (`service-catalog.ts`), producing all three `Conflict` kinds
 * across a spread of blast radii and corroboration/checkpoint states —
 * chosen specifically so the run exercises the gate's and arbitration's
 * REFUSALS, not merely a happy path (see this milestone's own
 * `.genesis/decisions/0006-domain.md` for the full scenario design
 * rationale).
 */

export const AGENTS = {
  autoScaler: agentId("autoscaler"),
  rollbackBot: agentId("rollbackbot"),
  cacheFlusher: agentId("cacheflusher"),
} as const;

export const RESOURCES = {
  checkoutService: resourceId("checkout-service"),
  sessionCache: resourceId("session-cache"),
  featureFlagConfig: resourceId("feature-flag-config"),
  internalMetricsStore: resourceId("internal-metrics-store"),
  diagnosticLogBucket: resourceId("diagnostic-log-bucket"),
} as const;

/** `NOW_T0` — the instant the incident's claims are all declared, and the instant used to evaluate every gate/arbitration call in this scenario except `featureFlagConfig`'s own "later" phase (see `NOW_T1` below). */
export const NOW_T0: Timestamp = timestamp("2026-09-22T10:00:00.000Z");
/** `NOW_T1` — five minutes after `NOW_T0`, used only for `featureFlagConfig`'s "checkpoint has since appeared" phase — see this file's own `featureFlagsEvidence("after")`. */
export const NOW_T1: Timestamp = timestamp("2026-09-22T10:05:00.000Z");

const SHARED_CHECKOUT_CHECKPOINT = checkpointId("incident-2091-sync-point");
const SHARED_FLAGS_CHECKPOINT = checkpointId("feature-flags-sync-point");

/**
 * `CLAIMS` — every `ResourceClaim` declared over the course of this
 * incident, fed to `detectConflicts` ONCE, exactly as a real caller would
 * (claims accumulate; `detectConflicts` is a pure function of the whole
 * set at a point in time, not called incrementally per agent). Note the
 * deliberate ABSENCE of any claim naming `(cacheFlusher,
 * diagnosticLogBucket)` — that absence is the entire point of the
 * `undeclared-access` conflict this scenario also exercises (see
 * `HEARTBEATS` below).
 */
export const CLAIMS: readonly ResourceClaim[] = [
  // checkout-service — write-write: RollbackBot (exclusive rollback, self-reported — nothing else confirms its own rollback intent) races AutoScaler (write, scale-up, cross-checked — the tower's own autoscaling ledger corroborates it). Deliberately ASYMMETRIC corroboration: this is the one conflict in this scenario where the intersection-vs-union aggregation policy (gate-aggregation.ts's own header) actually produces a different, demo-visible result — one participant's better evidence must NOT unlock quarantine for the whole conflict while the other's is still self-reported. Both anchor to the SAME shared incident checkpoint.
  { agentId: AGENTS.rollbackBot, resourceId: RESOURCES.checkoutService, mode: "exclusive", declaredAt: NOW_T0, ttl: 600_000, corroboration: "self-reported" },
  { agentId: AGENTS.autoScaler, resourceId: RESOURCES.checkoutService, mode: "write", declaredAt: NOW_T0, ttl: 600_000, corroboration: "cross-checked" },

  // session-cache — write-read: AutoScaler (write, invalidation) vs. CacheFlusher (read, pre-flush inspection). Both cross-checked (the tower's own resource ledger agrees); neither has a usable checkpoint.
  { agentId: AGENTS.autoScaler, resourceId: RESOURCES.sessionCache, mode: "write", declaredAt: NOW_T0, ttl: 300_000, corroboration: "cross-checked" },
  { agentId: AGENTS.cacheFlusher, resourceId: RESOURCES.sessionCache, mode: "read", declaredAt: NOW_T0, ttl: 300_000, corroboration: "cross-checked" },

  // feature-flag-config — write-write: AutoScaler vs. RollbackBot, both self-reported. This is the "evidence arrives over time" pair — see featureFlagsEvidence below.
  { agentId: AGENTS.autoScaler, resourceId: RESOURCES.featureFlagConfig, mode: "write", declaredAt: NOW_T0, ttl: 600_000, corroboration: "self-reported" },
  { agentId: AGENTS.rollbackBot, resourceId: RESOURCES.featureFlagConfig, mode: "exclusive", declaredAt: NOW_T0, ttl: 600_000, corroboration: "self-reported" },

  // internal-metrics-store — write-write: AutoScaler vs. CacheFlusher, both writing metrics tags. Low-stakes, self-reported; included so the run also proves a genuinely benign conflict is left at `observe`, not escalated for its own sake.
  { agentId: AGENTS.autoScaler, resourceId: RESOURCES.internalMetricsStore, mode: "write", declaredAt: NOW_T0, ttl: 120_000, corroboration: "self-reported" },
  { agentId: AGENTS.cacheFlusher, resourceId: RESOURCES.internalMetricsStore, mode: "write", declaredAt: NOW_T0, ttl: 120_000, corroboration: "self-reported" },
];

/** `HEARTBEATS` — CacheFlusher touches `diagnosticLogBucket` with no claim on file for that `(agent, resource)` pair at all — the real `undeclared-access` trigger, detected by `detectConflicts` from this heartbeat alone. */
export const HEARTBEATS: readonly Heartbeat[] = [{ agentId: AGENTS.cacheFlusher, resourceId: RESOURCES.diagnosticLogBucket, at: NOW_T0 }];

function freshCheckpoint(id: ReturnType<typeof checkpointId>, declaredAt: Timestamp): CheckpointDeclaration {
  return { reachable: true, resumable: true, checkpointId: id, declaredAt };
}

function noUsableCheckpoint(now: Timestamp): CheckpointDeclaration {
  return { reachable: false, resumable: false, checkpointId: checkpointId("none-declared"), declaredAt: now };
}

function claimOf(agent: AgentId, resource: ResourceId): ResourceClaim {
  const found = CLAIMS.find((c) => c.agentId === agent && c.resourceId === resource);
  if (found === undefined) {
    throw new Error(`Unreachable: scenario.ts's own CLAIMS has no entry for (${String(agent)}, ${String(resource)}).`);
  }
  return found;
}

/**
 * checkout-service — RollbackBot's own claim is self-reported;
 * AutoScaler's is cross-checked (this scenario's own `CLAIMS`, above).
 * Because `quarantine` requires EVERY relevant participant's own evidence
 * to clear `self-reported` (`gate-aggregation.ts`'s own intersection
 * policy), RollbackBot's weaker evidence withholds `quarantine` for the
 * WHOLE conflict even though AutoScaler's alone would have unlocked it —
 * this is the one conflict in this scenario where that policy is
 * demo-visible, not merely unit-tested (see this milestone's own build
 * report for the sabotage experiment flipping this to a union and showing
 * both the dedicated unit test AND this conflict's own ruling change).
 * Both agents anchor to the same fresh, shared checkpoint (gate grants
 * `pause`/`halt-checkpointed`). Combined with `checkout-service`'s `large`
 * blast radius (→ `corrupting` severity, floor `quarantine`), this is the
 * scenario's central "gate ceiling" moment: nothing the gate permits
 * reaches the floor severity demands, so `arbitrate` falls back to the
 * strongest available-and-realizable rung (`halt`/`checkpointed`) and
 * flags `escalationRecommended: true` — UNTIL a human authorization scoped
 * to this exact conflict is supplied, at which point `halt`/`forced` fires
 * instead. See `scripts/demo-incident.ts` for both runs, side by side.
 */
export function checkoutEvidence(): readonly ClaimEvidence[] {
  const checkpoint = freshCheckpoint(SHARED_CHECKOUT_CHECKPOINT, timestamp("2026-09-22T09:58:00.000Z"));
  return [
    { agentId: AGENTS.rollbackBot, claim: claimOf(AGENTS.rollbackBot, RESOURCES.checkoutService), checkpoint },
    { agentId: AGENTS.autoScaler, claim: claimOf(AGENTS.autoScaler, RESOURCES.checkoutService), checkpoint },
  ];
}

export function checkoutParticipants(): readonly ArbitrationParticipant[] {
  return [
    { agentId: AGENTS.rollbackBot, resourceId: RESOURCES.checkoutService, claimId: resourceClaimId("claim-rollbackbot-checkout"), checkpointId: SHARED_CHECKOUT_CHECKPOINT },
    { agentId: AGENTS.autoScaler, resourceId: RESOURCES.checkoutService, claimId: resourceClaimId("claim-autoscaler-checkout"), checkpointId: SHARED_CHECKOUT_CHECKPOINT },
  ];
}

/**
 * session-cache — BOTH agents cross-checked (gate grants `quarantine`)
 * but NEITHER has a usable checkpoint (gate withholds `pause`/
 * `halt-checkpointed`). `session-cache`'s `medium` blast radius (→
 * `contained` severity, floor `pause`) is met by the WEAKEST
 * available-and-realizable rung that reaches it — which, with `pause`
 * itself unavailable, is `quarantine` — proving the proportionality rule
 * picks the weakest sufficient option, not the strongest available one,
 * even when the "sufficient" option happens to be the strongest one on
 * offer.
 */
export function sessionCacheEvidence(): readonly ClaimEvidence[] {
  return [
    { agentId: AGENTS.autoScaler, claim: claimOf(AGENTS.autoScaler, RESOURCES.sessionCache), checkpoint: noUsableCheckpoint(NOW_T0) },
    { agentId: AGENTS.cacheFlusher, claim: claimOf(AGENTS.cacheFlusher, RESOURCES.sessionCache), checkpoint: noUsableCheckpoint(NOW_T0) },
  ];
}

export function sessionCacheParticipants(): readonly ArbitrationParticipant[] {
  return [
    { agentId: AGENTS.autoScaler, resourceId: RESOURCES.sessionCache, claimId: resourceClaimId("claim-autoscaler-session-cache") },
    { agentId: AGENTS.cacheFlusher, resourceId: RESOURCES.sessionCache, claimId: resourceClaimId("claim-cacheflusher-session-cache") },
  ];
}

/**
 * feature-flag-config — the SAME conflict, evaluated at two points in
 * time: `"before"` (no checkpoint declared yet by either agent — gate
 * withholds `pause`/`halt-checkpointed`, leaving only the baseline; with
 * `contained` severity demanding at least `pause`, arbitration cannot
 * reach the floor and falls back to `warn` with `escalationRecommended:
 * true`) and `"after"` (both agents have since anchored to the same fresh
 * checkpoint — `pause` is now available and meets the floor exactly,
 * chosen over the also-available-but-stronger `halt-checkpointed` by the
 * same weakest-sufficient rule `sessionCacheEvidence` demonstrates from
 * the opposite direction). This is the scenario's second "what changes
 * when the evidence improves" contrast, independent of the human-
 * authorization one `checkoutEvidence` demonstrates.
 */
export function featureFlagsEvidence(phase: "before" | "after"): readonly ClaimEvidence[] {
  const checkpoint = phase === "before" ? noUsableCheckpoint(NOW_T0) : freshCheckpoint(SHARED_FLAGS_CHECKPOINT, timestamp("2026-09-22T10:04:00.000Z"));
  const now = phase === "before" ? NOW_T0 : NOW_T1;
  return [
    { agentId: AGENTS.autoScaler, claim: { ...claimOf(AGENTS.autoScaler, RESOURCES.featureFlagConfig), declaredAt: now }, checkpoint },
    { agentId: AGENTS.rollbackBot, claim: { ...claimOf(AGENTS.rollbackBot, RESOURCES.featureFlagConfig), declaredAt: now }, checkpoint },
  ];
}

export function featureFlagsParticipants(phase: "before" | "after"): readonly ArbitrationParticipant[] {
  const base: ArbitrationParticipant[] = [
    { agentId: AGENTS.autoScaler, resourceId: RESOURCES.featureFlagConfig, claimId: resourceClaimId("claim-autoscaler-feature-flags") },
    { agentId: AGENTS.rollbackBot, resourceId: RESOURCES.featureFlagConfig, claimId: resourceClaimId("claim-rollbackbot-feature-flags") },
  ];
  if (phase === "before") return base;
  return base.map((p) => ({ ...p, checkpointId: SHARED_FLAGS_CHECKPOINT }));
}

/**
 * internal-metrics-store — `small` blast radius → `benign` severity,
 * floor `observe`. Deliberately unremarkable evidence (self-reported, no
 * checkpoint) — the point of this conflict is that NOTHING about the
 * evidence needs to be good for `observe` to already be adequate; a
 * `benign` conflict is never escalated merely because stronger options
 * happen to be reachable.
 */
export function metricsEvidence(): readonly ClaimEvidence[] {
  return [
    { agentId: AGENTS.autoScaler, claim: claimOf(AGENTS.autoScaler, RESOURCES.internalMetricsStore), checkpoint: noUsableCheckpoint(NOW_T0) },
    { agentId: AGENTS.cacheFlusher, claim: claimOf(AGENTS.cacheFlusher, RESOURCES.internalMetricsStore), checkpoint: noUsableCheckpoint(NOW_T0) },
  ];
}

export function metricsParticipants(): readonly ArbitrationParticipant[] {
  return [
    { agentId: AGENTS.autoScaler, resourceId: RESOURCES.internalMetricsStore, claimId: resourceClaimId("claim-autoscaler-metrics") },
    { agentId: AGENTS.cacheFlusher, resourceId: RESOURCES.internalMetricsStore, claimId: resourceClaimId("claim-cacheflusher-metrics") },
  ];
}

/**
 * diagnostic-log-bucket — `undeclared-access` by CacheFlusher. `small`
 * blast radius bumped one step by `computeSeverity` (see `severity-
 * policy.ts`) to `contained` (floor `pause`) — proving plan §2's own
 * "refuses to be treated as any weaker than the other two" refusal for
 * real: an undeclared touch on a SMALL-blast-radius resource is still
 * treated as seriously as a genuinely-claimed, contained-severity
 * collision. No legitimate claim exists at all
 * (`gate-aggregation.ts`'s own `noLegitimateClaimEvidence`), so the gate
 * can only ever offer the baseline — `pause` is demanded but structurally
 * unreachable, and arbitration falls back to `warn` with
 * `escalationRecommended: true`. No `ArbitrationParticipant` is supplied
 * for this conflict at all — there is no legitimate claim or checkpoint
 * to cite, and `arbitrate`'s own `relevantParticipants`/`uniqueCheckpointId`/
 * `claimIdsOf` already fail closed to `null` on an empty participant list,
 * which is the honest answer here.
 */
export function undeclaredAccessEvidence(): readonly ClaimEvidence[] {
  return [noLegitimateClaimEvidence(AGENTS.cacheFlusher, RESOURCES.diagnosticLogBucket, NOW_T0)];
}

export function undeclaredAccessParticipants(): readonly ArbitrationParticipant[] {
  return [];
}

export { blastRadiusOf, computeSeverity, combinedAvailableInterventions };
