import type { ResourceClaim, ResourceClaimMode } from "../contracts/resource-claim.js";
import { agentId, resourceId } from "../contracts/ids.js";
import { isNonEmptyArray } from "../contracts/non-empty-array.js";
import type { Heartbeat } from "./heartbeat.js";
import { deriveConflictId, type DetectedConflict } from "./detected-conflict.js";
import type { DetectionResult } from "./detection-result.js";

/**
 * `detectConflicts` — plan §4 M3's own scope, verbatim: "pure detection.
 * given claims and declarations, find the conflicts. It must be pure,
 * order-independent, and idempotent. No gating (M4), no arbitration (M5),
 * no interventions." This file is the whole of that scope; it selects an
 * `Intervention` for nothing, computes no `ConflictSeverity`, and reads no
 * `CheckpointDeclaration` at all (nothing in plan §2's definition of
 * `write-write`/`write-read`/`undeclared-access` mentions checkpoints —
 * that is `availableInterventions`'s (M4, unbuilt) own input, not
 * detection's).
 *
 * SIGNATURE, AND HOW IT DIFFERS FROM THE PLAN'S LITERAL TEXT: plan §4
 * writes `detectConflicts(claims: ResourceClaim[], heartbeats:
 * Heartbeat[]): Conflict[]`. This milestone returns `DetectionResult`
 * (`detection-result.ts`) instead of a bare `DetectedConflict[]` (itself
 * a richer stand-in for the bare `Conflict[]` the plan names — see
 * `detected-conflict.ts`'s header) for one concrete, falsifiable reason:
 * the SAME M3 plan section's own "what it refuses" bullet requires
 * refusing "to crash on a hostile claims array (throwing getter,
 * `Proxy`)," and its own falsifiability check demands "a typed failure
 * result, never an uncaught exception." A bare array return type has
 * structurally no slot to carry that failure — this is the identical
 * "the plan's prose and the plan's own later requirement pull in
 * different directions" shape `.genesis/decisions/0001-contracts.md`
 * Decision 3 already named for `Conflict`'s missing id, resolved here the
 * same way: build the richer shape the requirement actually needs,
 * document why in this milestone's own ADR
 * (`.genesis/decisions/0003-detection.md`), and say so plainly rather
 * than silently widening the plan's literal signature without a trace.
 *
 * WHY NO TIMESTAMP IS EVER COMPARED HERE, BY DESIGN, NOT BY OVERSIGHT:
 * plan §4 M3 also refuses "to guess when two claims' timestamps disagree
 * with the clock (fails closed to 'cannot order, treat as
 * simultaneous/conflicting,' never picks one arbitrarily)." This
 * function satisfies that refusal by construction rather than by adding
 * clock-comparison logic: detection never asks "which claim came first"
 * or "which claim is still fresh" at all — it only asks "do two
 * DIFFERENT agents hold claims, or a claim and an undeclared touch, that
 * are structurally incompatible on the same resource, right now, as a
 * set." Two claims with identical, reversed, or nonsensical
 * `declaredAt` values produce the exact same conflict set, because
 * `declaredAt` is never read by this function at all (confirmed by
 * `__tests__/order-independence.test.ts`'s own property test, which
 * randomizes `declaredAt` independently of everything else and asserts
 * no effect on the result). Freshness/staleness arithmetic against `ttl`
 * and `now` is `availableInterventions`'s job (M4, unbuilt,
 * `.genesis/decisions/0001-contracts.md` Decision 5) — a claim that has
 * technically expired is still a claim `ResourceClaim`-wise as far as
 * detection is concerned; whether the gate should still act on it is a
 * different, later question this function does not answer or guess at.
 *
 * WHY UNDECLARED-ACCESS IGNORES `ttl` FOR THE SAME REASON: "claimed" here
 * means "some `ResourceClaim` in the input names this exact
 * `(agentId, resourceId)` pair," full stop — not "names it AND has not
 * yet expired by `ttl`." Filtering by `ttl` here would require this pure,
 * `now`-free function to invent an implicit clock, which plan §4 M3's own
 * signature (no `now` parameter, unlike M4's `availableInterventions(...,
 * now)`) does not give it a legitimate way to do.
 *
 * GROUPING MODEL, STATED PLAINLY: for `write-write`/`write-read`, this
 * function reports ONE `DetectedConflict` per `(resourceId, kind)` naming
 * every distinct agent that participates — not one conflict per
 * colliding PAIR of agents. Three agents all holding `exclusive` claims
 * on the same resource is one `write-write` conflict naming all three,
 * not three pairwise conflicts. Nothing in plan §2's definition
 * ("two claims want exclusive/write on the same resource") requires
 * pairwise reporting, and the set-based model is what makes idempotence
 * (`__tests__/idempotence.test.ts`) hold structurally: a `Set` cannot
 * contain the same `agentId` twice no matter how many identical or
 * near-identical claims that agent re-declares, so "an agent re-declaring
 * the identical claim" (plan §4 M3's own idempotence refusal, verbatim)
 * cannot inflate this function's output by construction, not merely by a
 * dedup step bolted on afterward.
 */

interface SafeClaim {
  readonly agentId: string;
  readonly resourceId: string;
  readonly mode: ResourceClaimMode;
}

interface SafeHeartbeat {
  readonly agentId: string;
  readonly resourceId: string;
}

type SafeExtraction<T> = { readonly ok: true; readonly values: readonly T[] } | { readonly ok: false; readonly message: string };

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Reads every claim's `agentId`/`resourceId`/`mode` inside one `try`, so
 * a throwing getter on any single element, OR the `claims` array itself
 * being a `Proxy` that throws on iteration/`length`/indexed access (the
 * plan's own named attack shape), is caught here rather than propagating
 * out of `detectConflicts` as an uncaught exception. Deliberately does
 * NOT catch per-element (continue past a hostile one and skip it) —
 * plan §4 M3 asks for "a typed failure result," i.e. detection as a whole
 * did not run, not a partial result silently missing whichever element
 * happened to be hostile.
 */
function safeExtractClaims(claims: readonly ResourceClaim[]): SafeExtraction<SafeClaim> {
  try {
    const values: SafeClaim[] = [];
    for (const claim of claims) {
      const agentIdValue = claim.agentId;
      const resourceIdValue = claim.resourceId;
      const modeValue = claim.mode;
      values.push({ agentId: String(agentIdValue), resourceId: String(resourceIdValue), mode: modeValue });
    }
    return { ok: true, values };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

/** The heartbeat equivalent of `safeExtractClaims` above — same reasoning, same shape. */
function safeExtractHeartbeats(heartbeats: readonly Heartbeat[]): SafeExtraction<SafeHeartbeat> {
  try {
    const values: SafeHeartbeat[] = [];
    for (const heartbeat of heartbeats) {
      const agentIdValue = heartbeat.agentId;
      const resourceIdValue = heartbeat.resourceId;
      values.push({ agentId: String(agentIdValue), resourceId: String(resourceIdValue) });
    }
    return { ok: true, values };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

interface ResourceGroup {
  readonly writeAgents: Set<string>;
  readonly readAgents: Set<string>;
}

/** Builds one `ResourceGroup` per distinct `resourceId`, from already-safe (plain-string) claim data — nothing below this point can throw, so nothing below this point needs a `try`/`catch`. */
function groupClaimsByResource(claims: readonly SafeClaim[]): Map<string, ResourceGroup> {
  const groups = new Map<string, ResourceGroup>();
  for (const claim of claims) {
    let group = groups.get(claim.resourceId);
    if (!group) {
      group = { writeAgents: new Set(), readAgents: new Set() };
      groups.set(claim.resourceId, group);
    }
    if (claim.mode === "write" || claim.mode === "exclusive") {
      group.writeAgents.add(claim.agentId);
    } else {
      group.readAgents.add(claim.agentId);
    }
  }
  return groups;
}

/**
 * The internal key used to ask "does some claim name this exact
 * (resourceId, agentId) pair," for `undeclared-access` detection. ` `
 * (NUL) is used as the separator because it is the character least likely
 * to occur in a real id, matching `deriveConflictId`'s own `|` choice in
 * `detected-conflict.ts` (same honest limit: `lib/contracts/ids.ts` states
 * these tokens carry no alphabet restriction at all, so a sufficiently
 * adversarial id containing the separator could theoretically collide —
 * disclosed there, not re-argued here).
 */
function claimedPairKey(resourceIdValue: string, agentIdValue: string): string {
  return `${resourceIdValue} ${agentIdValue}`;
}

function buildClaimedPairs(claims: readonly SafeClaim[]): Set<string> {
  const pairs = new Set<string>();
  for (const claim of claims) {
    pairs.add(claimedPairKey(claim.resourceId, claim.agentId));
  }
  return pairs;
}

function computeConflicts(claims: readonly SafeClaim[], heartbeats: readonly SafeHeartbeat[]): readonly DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const groups = groupClaimsByResource(claims);

  for (const [resourceIdRaw, group] of groups) {
    if (group.writeAgents.size >= 2) {
      const participants = Array.from(group.writeAgents).sort().map(agentId);
      if (isNonEmptyArray(participants)) {
        conflicts.push({
          id: deriveConflictId("write-write", resourceId(resourceIdRaw), participants),
          kind: "write-write",
          resourceId: resourceId(resourceIdRaw),
          agentIds: participants,
        });
      }
    }

    const readOnlyAgents = Array.from(group.readAgents).filter((candidate) => !group.writeAgents.has(candidate));
    if (group.writeAgents.size >= 1 && readOnlyAgents.length >= 1) {
      const unionAgents = new Set<string>([...group.writeAgents, ...readOnlyAgents]);
      const participants = Array.from(unionAgents).sort().map(agentId);
      if (isNonEmptyArray(participants)) {
        conflicts.push({
          id: deriveConflictId("write-read", resourceId(resourceIdRaw), participants),
          kind: "write-read",
          resourceId: resourceId(resourceIdRaw),
          agentIds: participants,
        });
      }
    }
  }

  const claimedPairs = buildClaimedPairs(claims);
  const reportedUndeclared = new Set<string>();
  for (const heartbeat of heartbeats) {
    const key = claimedPairKey(heartbeat.resourceId, heartbeat.agentId);
    if (claimedPairs.has(key) || reportedUndeclared.has(key)) {
      continue;
    }
    reportedUndeclared.add(key);
    const participants = [agentId(heartbeat.agentId)];
    if (isNonEmptyArray(participants)) {
      conflicts.push({
        id: deriveConflictId("undeclared-access", resourceId(heartbeat.resourceId), participants),
        kind: "undeclared-access",
        resourceId: resourceId(heartbeat.resourceId),
        agentIds: participants,
      });
    }
  }

  // Sort by `id` — deterministic because `id` is itself a deterministic
  // function of (kind, resourceId, sorted agentIds), so this ordering
  // never depends on which order `claims`/`heartbeats` arrived in, only
  // on the SET of conflicts actually detected. This is what makes
  // `detectConflicts(shuffle(claims), shuffle(heartbeats))` produce an
  // ARRAY that is `toEqual` (order included) the unshuffled call's
  // result, not merely the same conflicts in a different order.
  return conflicts.slice().sort((left, right) => (String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0));
}

export function detectConflicts(claims: readonly ResourceClaim[], heartbeats: readonly Heartbeat[]): DetectionResult {
  const claimsResult = safeExtractClaims(claims);
  if (!claimsResult.ok) {
    return { ok: false, error: { kind: "hostile-claims-input", message: claimsResult.message } };
  }

  const heartbeatsResult = safeExtractHeartbeats(heartbeats);
  if (!heartbeatsResult.ok) {
    return { ok: false, error: { kind: "hostile-heartbeats-input", message: heartbeatsResult.message } };
  }

  return { ok: true, conflicts: computeConflicts(claimsResult.values, heartbeatsResult.values) };
}
