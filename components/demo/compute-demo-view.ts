import {
  checkpointId,
  timestamp,
  type CheckpointDeclaration,
  type Corroboration,
  type ConflictSeverity,
  type HumanId,
  type ResourceClaim,
} from "../../lib/contracts/index.js";
import { detectConflicts, type DetectedConflict } from "../../lib/conflict/index.js";
import type { AvailableInterventionSet } from "../../lib/gate/index.js";
import {
  arbitrate,
  type HumanAuthorization,
  type InterventionRuling,
} from "../../lib/arbitrate/index.js";
import {
  AGENTS,
  CLAIMS,
  HEARTBEATS,
  NOW_T0,
  RESOURCES,
  blastRadiusOf,
  checkoutParticipants,
  combinedAvailableInterventions,
  computeSeverity,
  type ClaimEvidence,
} from "../../domains/incident-response/index.js";

/**
 * `compute-demo-view.ts` — the ENTIRE bridge between M8's UI knobs and the
 * real, frozen engine (`detectConflicts`, `combinedAvailableInterventions`,
 * `arbitrate`, all M3/M4/M6, untouched by this milestone). Plan §4 M8's own
 * refusal, verbatim: "to render a ruling the engine didn't actually produce
 * for the exact inputs on screen at that moment (no pre-baked transcript)."
 * This file is where that refusal is enforced: it is the ONLY place in
 * `components/demo/**` that imports an engine function, and every field on
 * the `DemoView` it returns is either read verbatim off a real return value
 * or a `null` standing in for "the engine had nothing to say yet" (no
 * conflict detected). `IncidentDemo.tsx` never calls an engine function
 * itself — it only formats what this file handed back.
 *
 * WHY A PURE FUNCTION OF `DemoKnobs`, NOT A REACT HOOK OR STORED STATE: the
 * account's own standing lesson from a sibling project's M8 (repeated in
 * this milestone's own task brief) is that a stale-state race is possible
 * only when a component holds DERIVED state that can drift from the
 * source. `computeDemoView` has no memory of its own — same `DemoKnobs` in,
 * byte-identical `DemoResult` out, every time, computed fresh from the real
 * engine on every call. `IncidentDemo.tsx` calls this function directly in
 * its render body (no `useEffect`, no `useCallback`, no memoization) —
 * simplest and safest, exactly because the engine underneath is itself
 * synchronous and pure.
 *
 * WHY THIS SCOPES THE INTERACTIVE PART TO `checkout-service` ALONE: plan
 * §4 M8's own scope line calls out ONE headline moment by name — "the
 * tower refuses to force-halt on its own evidence, does so when given an
 * authorization scoped to that exact conflict, and refuses again when the
 * authorization belongs to a different conflict" — and `.genesis/
 * decisions/0006-domain.md` names `checkout-service` as the scenario's own
 * "central 'gate ceiling' moment" for exactly that story. Narrowing the
 * LIVE-INJECTION knobs to this one conflict (while still running the real,
 * un-narrowed `CLAIMS`/`HEARTBEATS` underneath, so the OTHER four conflicts
 * this scenario detects are still real and still used — see
 * `otherConflictId` below) keeps every reachable UI state small enough to
 * exhaustively test (`__tests__/compute-demo-view.test.ts` enumerates every
 * knob combination) rather than guessing at coverage over a much larger
 * cross-product the plan never asked for. See `.genesis/decisions/
 * 0009-demo.md` for the full argument and the honest limit this leaves.
 */

export type CheckpointReadiness = "fresh" | "stale" | "unreachable";
export type AuthorizationChoice = "none" | "this-conflict" | "other-conflict";

export interface DemoKnobs {
  /** Whether AutoScaler's competing claim on checkout-service has been injected yet. `false` is the "clean run": only RollbackBot's own claim exists, so `detectConflicts` finds no write-write collision there at all. */
  readonly injected: boolean;
  /** RollbackBot's own corroboration on its checkout-service claim — the ONE piece of evidence this scenario's own ADR (`0006-domain.md`) documents as "the one conflict ... where the intersection-vs-union aggregation policy actually produces a different, demo-visible result." AutoScaler's own claim stays fixed at `cross-checked`, matching the scenario's own fixture. */
  readonly rollbackCorroboration: Corroboration;
  /** The shared checkpoint both agents anchor to — fresh (matches the scenario fixture), stale (past `STALENESS_BOUND_MS`), or unreachable (`reachable: false`). */
  readonly checkpoint: CheckpointReadiness;
  /** Human authorization: withheld, scoped to the checkout-service conflict itself, or scoped to a DIFFERENT real, live-detected conflict (session-cache's) — the exact three-way contrast `scripts/demo-incident.ts` runs for this same conflict. */
  readonly authorization: AuthorizationChoice;
}

export const DEFAULT_KNOBS: DemoKnobs = {
  injected: false,
  rollbackCorroboration: "self-reported",
  checkpoint: "fresh",
  authorization: "none",
};

export interface DemoView {
  /** `detectConflicts`'s own result for checkout-service, or `null` if the clean-run state has no collision there yet. Never a placeholder — either a real `DetectedConflict` or nothing. */
  readonly checkoutConflict: DetectedConflict | null;
  /** The real, live-detected conflict id for session-cache — used both to LABEL the "other conflict" authorization choice honestly (not a made-up id) and, when that choice is selected, as the actual `conflictId` on the `HumanAuthorization` passed into `arbitrate`. */
  readonly otherConflictId: string;
  /** `combinedAvailableInterventions`'s own return value. `null` only when `checkoutConflict` is `null` — there is nothing to gate when nothing has collided yet. */
  readonly available: AvailableInterventionSet | null;
  /** `computeSeverity`'s own return value for this conflict. `null` under the same condition as `available`. */
  readonly severity: ConflictSeverity | null;
  /** The `HumanAuthorization` actually passed to `arbitrate` this render (or `null` if withheld) — rendered so the UI can show exactly what was supplied, not merely the knob's label. */
  readonly humanAuthorization: HumanAuthorization | null;
  /** `arbitrate`'s own single ruling for this conflict. `null` under the same condition as `available`. */
  readonly ruling: InterventionRuling | null;
}

export type DemoResult = { readonly ok: true; readonly view: DemoView } | { readonly ok: false; readonly error: string };

function buildCheckpoint(readiness: CheckpointReadiness): CheckpointDeclaration {
  if (readiness === "unreachable") {
    return {
      reachable: false,
      resumable: false,
      checkpointId: checkpointId("demo-checkout-checkpoint"),
      declaredAt: NOW_T0,
    };
  }
  // "fresh": 2 minutes before NOW_T0, matching the scenario's own fixture
  // (well inside `STALENESS_BOUND_MS`, 5 minutes). "stale": 12 minutes
  // before NOW_T0 — past the bound by a comfortable margin, not merely by
  // one tick (the exact-boundary N/N+1 case already has its own dedicated,
  // frozen test in `lib/gate/__tests__/clock.test.ts`; this UI knob only
  // needs to demonstrate the flip, not re-litigate the boundary).
  const declaredAt = readiness === "fresh" ? timestamp("2026-09-22T09:58:00.000Z") : timestamp("2026-09-22T09:48:00.000Z");
  return {
    reachable: true,
    resumable: true,
    checkpointId: checkpointId("demo-checkout-checkpoint"),
    declaredAt,
  };
}

/**
 * Builds the exact `ResourceClaim[]` this render's `detectConflicts` call
 * sees: the scenario's own frozen `CLAIMS` (so session-cache,
 * feature-flag-config, internal-metrics-store, and diagnostic-log-bucket's
 * conflicts are all still real and still detected — this function narrows
 * which knobs the UI exposes, never the ground truth `detectConflicts`
 * itself runs against), with exactly two changes: RollbackBot's own
 * checkout-service claim gets this render's chosen corroboration, and
 * AutoScaler's competing checkout-service claim is present only once
 * `knobs.injected` is true.
 */
function buildClaims(knobs: DemoKnobs): readonly ResourceClaim[] {
  return CLAIMS.flatMap((claim): readonly ResourceClaim[] => {
    const onCheckout = claim.resourceId === RESOURCES.checkoutService;
    if (!onCheckout) return [claim];
    if (claim.agentId === AGENTS.autoScaler) {
      return knobs.injected ? [claim] : [];
    }
    if (claim.agentId === AGENTS.rollbackBot) {
      return [{ ...claim, corroboration: knobs.rollbackCorroboration }];
    }
    return [claim];
  });
}

export function computeDemoView(knobs: DemoKnobs): DemoResult {
  try {
    const claims = buildClaims(knobs);
    const detection = detectConflicts(claims, HEARTBEATS);
    if (!detection.ok) {
      return { ok: false, error: `detectConflicts reported a hostile-input failure: ${detection.error.kind} — ${detection.error.message}` };
    }

    const conflicts = detection.conflicts;
    const checkoutConflict = conflicts.find((c) => String(c.resourceId) === String(RESOURCES.checkoutService)) ?? null;
    const sessionCacheConflict = conflicts.find((c) => String(c.resourceId) === String(RESOURCES.sessionCache));
    if (sessionCacheConflict === undefined) {
      return { ok: false, error: "Unreachable: the scenario's own frozen CLAIMS must always produce a session-cache conflict, independent of every knob this UI exposes." };
    }

    if (checkoutConflict === null) {
      return {
        ok: true,
        view: {
          checkoutConflict: null,
          otherConflictId: String(sessionCacheConflict.id),
          available: null,
          severity: null,
          humanAuthorization: null,
          ruling: null,
        },
      };
    }

    const checkpoint = buildCheckpoint(knobs.checkpoint);
    const rollbackClaim = claims.find((c) => c.agentId === AGENTS.rollbackBot && c.resourceId === RESOURCES.checkoutService);
    const autoScalerClaim = claims.find((c) => c.agentId === AGENTS.autoScaler && c.resourceId === RESOURCES.checkoutService);
    if (rollbackClaim === undefined || autoScalerClaim === undefined) {
      return { ok: false, error: "Unreachable: checkoutConflict was detected but one of its two claims is missing from this render's own claims array." };
    }
    const evidence: readonly ClaimEvidence[] = [
      { agentId: AGENTS.rollbackBot, claim: rollbackClaim, checkpoint },
      { agentId: AGENTS.autoScaler, claim: autoScalerClaim, checkpoint },
    ];

    const available = combinedAvailableInterventions(evidence, checkoutConflict.agentIds, NOW_T0);
    const severity = computeSeverity(checkoutConflict.kind, blastRadiusOf(checkoutConflict.resourceId));

    const humanAuthorization: HumanAuthorization | null =
      knobs.authorization === "none"
        ? null
        : knobs.authorization === "this-conflict"
          ? { authorizedBy: "ops-lead-jordan" as HumanId, conflictId: checkoutConflict.id }
          : { authorizedBy: "ops-lead-jordan" as HumanId, conflictId: sessionCacheConflict.id };

    const rulings = arbitrate([checkoutConflict], [available], [severity], checkoutParticipants(), humanAuthorization ?? undefined);
    const ruling = rulings[0];
    if (ruling === undefined) {
      return { ok: false, error: "Unreachable: arbitrate() returned no ruling for a single input conflict." };
    }

    return {
      ok: true,
      view: {
        checkoutConflict,
        otherConflictId: String(sessionCacheConflict.id),
        available,
        severity,
        humanAuthorization,
        ruling,
      },
    };
  } catch (err) {
    // Defense in depth, not the primary guarantee: `buildClaims`/
    // `buildCheckpoint` above construct every engine input from a small,
    // exhaustively-tested `DemoKnobs` cross-product (see this file's own
    // `__tests__/compute-demo-view.test.ts`), so `combinedAvailableInterventions`
    // is never called with evidence that doesn't cover exactly `checkoutConflict.agentIds`,
    // and `arbitrate` is never called with mismatched array lengths or
    // duplicate conflict ids — by construction, not by this catch. This
    // catch exists so a future edit to either file that broke that
    // invariant would surface as a visible, typed `DemoResult` failure
    // (rendered by `IncidentDemo.tsx` as a distinct error panel) rather
    // than an uncaught exception blanking the whole page.
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
