import type { CheckpointId, ConflictId, ResourceClaimId } from "./ids.js";
import type { HumanId } from "./human-id.js";
import type { NonEmptyArray } from "./non-empty-array.js";

/**
 * `Intervention` — the closed enum at the centre (plan §2). Five top-level
 * variants (`observe`, `warn`, `pause`, `halt`, `quarantine`), with `halt`
 * carrying a closed 2-value `mode` — the same shape decision-engine uses
 * for `escalate`'s four sub-causes (one outcome name, several mechanically
 * distinct, type-distinguishable causes; `decision-engine/lib/contracts/
 * decision.ts`), applied here to the one intervention whose two causes
 * have opposite risk profiles.
 *
 * WHAT EACH VARIANT REFUSES (plan §2, verbatim reasoning, restated per
 * field so each refusal is checkable against the type below, not just
 * against prose):
 *
 *   - `observe`     — carries no data. It structurally cannot justify or
 *                      record an action it didn't take.
 *   - `warn`        — carries only `message: string`. No field capable of
 *                      touching agent state or revoking a claim exists on
 *                      this variant — a reviewer can confirm that by
 *                      reading the type, not the call sites.
 *   - `pause`       — refuses to be constructed without `checkpointId`.
 *   - `halt` /
 *     `checkpointed` — the same `checkpointId` requirement as `pause`.
 *                      Declared, honestly, as best-effort-resumable, not
 *                      guaranteed reversible once selected (a fact for
 *                      callers to know, not something this type can
 *                      enforce by itself).
 *   - `halt` /
 *     `forced`      — THE central design commitment (plan §4, M1; see
 *                      also `.genesis/PLAN.md`'s own "riskiest design
 *                      decision" section). Refuses to compile without
 *                      `authorizedBy: HumanId` AND `conflictId:
 *                      ConflictId` — a stale or borrowed authorization for
 *                      a different conflict is a type mismatch at the
 *                      point something tries to construct THIS variant
 *                      with the wrong ids, not a policy check caught
 *                      later. No engine milestone (M3, M4, or M5) may
 *                      construct this variant on its own initiative — see
 *                      `human-id.ts`'s header for how that is enforced
 *                      past what a required field alone can guarantee,
 *                      and `assertValidHaltForced` below for the parallel
 *                      runtime guard against a value that reached this
 *                      shape via an unsafe cast rather than real
 *                      construction. Mirrors a fact read directly in
 *                      agent-trust-layer's own architecture snapshot:
 *                      "refuses ▸ revocation not checked, unless a human
 *                      signed off by name."
 *   - `quarantine`  — refuses to fire with an empty `revokedClaims`:
 *                      `NonEmptyArray<ResourceClaimId>` (non-empty-
 *                      array.ts), not `ResourceClaimId[]` plus a runtime
 *                      length check. Quarantine claims to *revoke*
 *                      something; an empty revocation list is not a
 *                      quarantine, it is an `observe` wearing a costume.
 */
export type Intervention =
  | { readonly kind: "observe" }
  | { readonly kind: "warn"; readonly message: string }
  | { readonly kind: "pause"; readonly checkpointId: CheckpointId }
  | { readonly kind: "halt"; readonly mode: "checkpointed"; readonly checkpointId: CheckpointId }
  | {
      readonly kind: "halt";
      readonly mode: "forced";
      readonly authorizedBy: HumanId;
      readonly conflictId: ConflictId;
    }
  | { readonly kind: "quarantine"; readonly revokedClaims: NonEmptyArray<ResourceClaimId> };

/**
 * Exhaustiveness helper for `switch (intervention.kind)` (and, for `halt`,
 * a nested `switch (intervention.mode)` inside the `"halt"` case) — same
 * pattern as decision-engine's `assertNeverOutcome` / shadow-run's
 * `assertNeverReconciliation` / memory-ledger's `assertNeverBeliefAnswer`.
 * Never called at runtime (the `never` parameter type makes that
 * impossible for any value TypeScript itself considers reachable); its
 * only job is to make an unhandled variant a COMPILE error at the call
 * site the moment a sixth top-level kind (or a third `halt` mode) is ever
 * added. `Intervention` itself stays frozen at five kinds / two `halt`
 * modes for this milestone, so `__tests__/intervention.test.ts`
 * demonstrates the mechanism failing on an equivalent LOCAL six-kind
 * stand-in type rather than dishonestly widening the real one just to
 * prove a point — the same choice shadow-run's own
 * `reconciliation.test.ts` documents making for the identical reason.
 */
export function assertNeverIntervention(value: never): never {
  throw new Error(`Unreachable: unhandled Intervention ${JSON.stringify(value)}`);
}

/** The `halt`/`forced` variant, named on its own so `assertValidHaltForced` below has something to accept without repeating the full six-member union inline. */
export type HaltForced = Extract<Intervention, { kind: "halt"; mode: "forced" }>;

export interface InvalidHaltForced {
  readonly kind: "missing-authorized-by" | "missing-conflict-id";
  readonly received: unknown;
}

export type HaltForcedResult = { readonly ok: true } | { readonly ok: false; readonly error: InvalidHaltForced };

/**
 * The parallel RUNTIME guard the plan's own M1 falsifiability check
 * demands (`.genesis/PLAN.md` §4, M1): "a parallel runtime guard
 * (`assertValidHaltForced`) independently rejects a value that reached
 * this shape via an unsafe cast — the type check alone is not treated as
 * sufficient." A required field stops an ACCIDENTAL assignment (writing a
 * `{ kind: "halt", mode: "forced" }` literal with a field missing is a
 * compile error); it cannot stop a DELIBERATE cast
 * (`{ kind: "halt", mode: "forced" } as HaltForced` compiles with zero
 * errors, because a cast is an explicit assertion, not an assignment —
 * the exact gap decision-engine's own honest-limits section documents for
 * branded types: a guarantee "stops an accidental assignment, not a
 * deliberate cast." This function is that second, independent check: it
 * reads the actual runtime value (which, for a cast-constructed object,
 * may simply be missing the properties the type claims exist) rather than
 * trusting what the static type says is there.
 *
 * Deliberately returns a typed result rather than throwing directly, the
 * same shape `parseConfidence`/`parseCapturedAt` use elsewhere in the
 * sibling projects: a caller (M5's `arbitrate`, unbuilt) gets a value it
 * must inspect, not an exception it might forget to catch.
 */
export function assertValidHaltForced(value: HaltForced): HaltForcedResult {
  if (typeof value.authorizedBy !== "string" || value.authorizedBy.length === 0) {
    return { ok: false, error: { kind: "missing-authorized-by", received: value.authorizedBy } };
  }
  if (typeof value.conflictId !== "string" || value.conflictId.length === 0) {
    return { ok: false, error: { kind: "missing-conflict-id", received: value.conflictId } };
  }
  return { ok: true };
}
