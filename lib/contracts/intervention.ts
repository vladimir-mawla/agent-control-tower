import type { CheckpointId, ConflictId, ResourceClaimId } from "./ids.js";
import type { HumanId } from "./human-id.js";
import type { NonEmptyArray } from "./non-empty-array.js";

/**
 * THE CLAIM THIS FILE ACTUALLY MAKES ABOUT `halt`/`forced`, STATED ONCE
 * HERE AT ITS TRUE STRENGTH, AFTER INDEPENDENT VERIFICATION REPORTED A
 * WORKING BYPASS OF AN EARLIER, OVERSTATED VERSION OF THIS CLAIM:
 *
 * The type system makes an unauthorized `halt`/`forced` impossible to
 * construct ACCIDENTALLY (an object literal missing `authorizedBy` or
 * `conflictId` is a compile error — see the `@ts-expect-error` proofs in
 * `__tests__/intervention.test.ts`) or CONVENIENTLY (no function anywhere
 * in `lib/` mints a `HumanId` from a raw string — see `human-id.ts` — and
 * `__tests__/human-id.test.ts` semantically greps for a cast into that
 * brand, resolved through the real type checker so an aliased or
 * re-exported import cannot hide one either). It does NOT, and no
 * TypeScript design CAN, stop a `halt`/`forced` value reached by a
 * DELIBERATE cast through `unknown` at the OUTER type — e.g.
 * `{ kind: "halt", mode: "forced", authorizedBy: "not-a-real-human",
 * conflictId: "fake-conflict" } as unknown as HaltForced` — because that
 * cast never names `HumanId` as a type at all; it bypasses this file's
 * every field requirement in one step, at the object's own boundary, not
 * at any one field's. Reaching a `halt`/`forced` this way requires writing
 * that cast, in cleartext, inside `lib/` — a visible, reviewable act that
 * looks exactly like what it is, not something a policy check catches
 * later and not something achievable by accident or by reaching for an
 * innocuous-looking helper. See `.genesis/decisions/0001-contracts.md`
 * Decision 2 for the full incident report (two independently-verified
 * bypasses, what each one broke, and what was fixed vs. what is disclosed
 * as a permanent, unclosable limit of any type system).
 */

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
 *                      decision" section, and this file's own header
 *                      above for the claim's exact, verified strength).
 *                      Refuses to COMPILE without `authorizedBy: HumanId`
 *                      AND `conflictId: ConflictId` together — omitting
 *                      either is a compile error at the object-literal
 *                      call site, not a policy check caught later. No
 *                      engine milestone (M3, M4, or M5) should reach for
 *                      a convenience constructor to satisfy that
 *                      requirement, because none exists — see
 *                      `human-id.ts`'s header for how that is enforced
 *                      past what a required field alone can guarantee,
 *                      and `assertValidHaltForced` below for the narrower,
 *                      honestly-scoped runtime guard against a cast that
 *                      drops or blanks a field entirely. Mirrors a fact
 *                      read directly in agent-trust-layer's own
 *                      architecture snapshot: "refuses ▸ revocation not
 *                      checked, unless a human signed off by name."
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
 * sufficient."
 *
 * ITS TRUE, VERIFIED SCOPE — NARROWED HERE AFTER INDEPENDENT VERIFICATION
 * REPORTED A WORKING BYPASS OF AN EARLIER, OVERSTATED VERSION OF THIS
 * COMMENT: this function checks that `authorizedBy` and `conflictId` are
 * PRESENT, non-empty strings at runtime. That catches a cast that drops
 * or blanks a field entirely — e.g. `{ kind: "halt", mode: "forced",
 * conflictId: someId } as unknown as HaltForced` (no `authorizedBy` at
 * all) or one where a field survived as `""`/`undefined`. It does NOT,
 * and CANNOT, verify that `authorizedBy` names a real, consenting human,
 * or that `conflictId` genuinely corresponds to the conflict being ruled
 * on — a FULLY-FORMED cast such as `{ kind: "halt", mode: "forced",
 * authorizedBy: "not-a-real-human", conflictId: "fake-conflict" } as
 * unknown as HaltForced` satisfies this check completely, by design, not
 * by oversight: verifying either fact for real would require a secret
 * this function does not and should not hold (`lib/contracts` is a pure,
 * frozen, I/O-free type library — see `.genesis/PLAN.md`'s own "no real
 * I/O in lib" discipline) or an external record to check against, which
 * is `HumanAuthorization`-style matching left to M5's `arbitrate`
 * (unbuilt) to build, if it ever does, against real infrastructure this
 * milestone does not have. A check computed from data this function
 * already holds (e.g. a hash of `authorizedBy`+`conflictId`) would add
 * NOTHING here: an attacker with `as unknown as X` already has source
 * access to `lib/contracts` and could compute the identical hash for
 * their own fabricated fields, so such a check would be theater, not
 * defense — deliberately not added for that reason. This is the same
 * "no TypeScript design can stop a deliberate cast" property this file's
 * own header states for the type system as a whole, one layer down: a
 * required field stops an ACCIDENTAL assignment; this function additionally
 * stops a CARELESS cast that never bothered to populate every field; NEITHER
 * stops a DELIBERATE, fully-formed one — see `.genesis/decisions/
 * 0001-contracts.md` Decision 2 for the incident this narrowing responds to,
 * and `__tests__/intervention.test.ts` for a test that reproduces the exact
 * reported bypass and pins that it passes this check today, as a disclosed,
 * accepted limit, not a silently-undiscovered one.
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
