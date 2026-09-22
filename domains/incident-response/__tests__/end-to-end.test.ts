import { describe, expect, it } from "vitest";
import type { HumanId } from "../../../lib/contracts/index.js";
import { detectConflicts } from "../../../lib/conflict/index.js";
import { arbitrate, type HumanAuthorization } from "../../../lib/arbitrate/index.js";
import {
  CLAIMS,
  HEARTBEATS,
  NOW_T0,
  NOW_T1,
  RESOURCES,
  blastRadiusOf,
  checkoutEvidence,
  checkoutParticipants,
  combinedAvailableInterventions,
  computeSeverity,
  featureFlagsEvidence,
  featureFlagsParticipants,
  metricsEvidence,
  metricsParticipants,
  sessionCacheEvidence,
  sessionCacheParticipants,
  undeclaredAccessEvidence,
  undeclaredAccessParticipants,
} from "../scenario.js";

/**
 * `end-to-end.test.ts` — the full `detectConflicts` → `combinedAvailable
 * Interventions` → `arbitrate` pipeline, run once per this scenario's five
 * conflicts, asserting the EXACT resulting `InterventionRuling` (kind,
 * mode where relevant, rule, escalationRecommended) — not merely "no
 * exception thrown." Each assertion is strict enough that flipping this
 * milestone's own intersection policy to a union, or swapping
 * `computeSeverity`'s one-step bump for a no-op, changes a concrete,
 * asserted value here, not just the demo script's prose (see this
 * milestone's own build report for the sabotage experiment proving this).
 */

function conflictOn(resource: (typeof RESOURCES)[keyof typeof RESOURCES]) {
  const result = detectConflicts(CLAIMS, HEARTBEATS);
  if (!result.ok) throw new Error("Unreachable: scenario data is well-formed.");
  const found = result.conflicts.find((c) => String(c.resourceId) === String(resource));
  if (found === undefined) throw new Error(`Unreachable: no detected conflict for resource ${String(resource)}.`);
  return found;
}

describe("checkout-service — self-reported + fresh shared checkpoint, corrupting severity: gate-ceiling, then human-forced-escalation", () => {
  const conflict = conflictOn(RESOURCES.checkoutService);
  const severity = computeSeverity(conflict.kind, blastRadiusOf(conflict.resourceId));
  const available = combinedAvailableInterventions(checkoutEvidence(), NOW_T0);

  it("severity is corrupting (large blast radius, a declared write-write conflict)", () => {
    expect(severity).toBe("corrupting");
  });

  it("the gate withholds quarantine (both claims self-reported) but grants pause/halt-checkpointed (shared, fresh checkpoint)", () => {
    expect(available.has("quarantine")).toBe(false);
    expect(available.has("pause")).toBe(true);
    expect(available.has("halt-checkpointed")).toBe(true);
  });

  it("with NO human authorization: arbitrate refuses to force-halt and falls back to the strongest available option, flagged for escalation", () => {
    const [ruling] = arbitrate([conflict], [available], [severity], checkoutParticipants());
    expect(ruling?.intervention).toMatchObject({ kind: "halt", mode: "checkpointed" });
    expect(ruling?.rule).toBe("gate-ceiling");
    expect(ruling?.escalationRecommended).toBe(true);
    expect(ruling?.evidence.humanAuthorizationMatched).toBe(false);
  });

  it("with a human authorization scoped to THIS conflict: arbitrate selects halt/forced instead, citing no further escalation", () => {
    const auth: HumanAuthorization = { authorizedBy: "ops-lead-jordan" as HumanId, conflictId: conflict.id };
    const [ruling] = arbitrate([conflict], [available], [severity], checkoutParticipants(), auth);
    expect(ruling?.intervention).toEqual({ kind: "halt", mode: "forced", authorizedBy: "ops-lead-jordan", conflictId: conflict.id });
    expect(ruling?.rule).toBe("human-forced-escalation");
    expect(ruling?.escalationRecommended).toBe(false);
  });

  it("a human authorization scoped to a DIFFERENT conflict does not license a forced halt here — the exact ruling as the no-auth case", () => {
    const otherConflict = conflictOn(RESOURCES.sessionCache);
    const wrongAuth: HumanAuthorization = { authorizedBy: "ops-lead-jordan" as HumanId, conflictId: otherConflict.id };
    const [ruling] = arbitrate([conflict], [available], [severity], checkoutParticipants(), wrongAuth);
    expect(ruling?.intervention).toMatchObject({ kind: "halt", mode: "checkpointed" });
    expect(ruling?.rule).toBe("gate-ceiling");
    expect(ruling?.escalationRecommended).toBe(true);
  });
});

describe("session-cache — cross-checked but no usable checkpoint, contained severity: quarantine, the weakest sufficient realizable option", () => {
  it("quarantine fires, proportionate to contained severity, even though it is the strongest realizable rung on offer", () => {
    const conflict = conflictOn(RESOURCES.sessionCache);
    const severity = computeSeverity(conflict.kind, blastRadiusOf(conflict.resourceId));
    const available = combinedAvailableInterventions(sessionCacheEvidence(), NOW_T0);
    expect(severity).toBe("contained");
    expect(available.has("pause")).toBe(false);
    expect(available.has("halt-checkpointed")).toBe(false);
    expect(available.has("quarantine")).toBe(true);

    const [ruling] = arbitrate([conflict], [available], [severity], sessionCacheParticipants());
    expect(ruling?.intervention.kind).toBe("quarantine");
    expect(ruling?.rule).toBe("severity-satisfied");
    expect(ruling?.escalationRecommended).toBe(false);
  });
});

describe("feature-flag-config — the same conflict, before and after a checkpoint appears", () => {
  const conflict = conflictOn(RESOURCES.featureFlagConfig);
  const severity = computeSeverity(conflict.kind, blastRadiusOf(conflict.resourceId));

  it("severity is contained (medium blast radius, declared write-write)", () => {
    expect(severity).toBe("contained");
  });

  it("before: no checkpoint yet — gate offers only the baseline, arbitrate falls back to warn with escalation recommended", () => {
    const available = combinedAvailableInterventions(featureFlagsEvidence("before"), NOW_T0);
    expect([...available].sort()).toEqual(["observe", "warn"]);
    const [ruling] = arbitrate([conflict], [available], [severity], featureFlagsParticipants("before"));
    expect(ruling?.intervention).toEqual({ kind: "warn", message: expect.stringContaining(String(conflict.id)) });
    expect(ruling?.rule).toBe("gate-ceiling");
    expect(ruling?.escalationRecommended).toBe(true);
  });

  it("after: a fresh, shared checkpoint has appeared — pause is now available and exactly meets the floor", () => {
    const available = combinedAvailableInterventions(featureFlagsEvidence("after"), NOW_T1);
    expect(available.has("pause")).toBe(true);
    const [ruling] = arbitrate([conflict], [available], [severity], featureFlagsParticipants("after"));
    expect(ruling?.intervention.kind).toBe("pause");
    expect(ruling?.rule).toBe("severity-satisfied");
    expect(ruling?.escalationRecommended).toBe(false);
  });
});

describe("internal-metrics-store — benign severity, observe is already adequate", () => {
  it("observe fires, unescalated, regardless of the (unremarkable) evidence", () => {
    const conflict = conflictOn(RESOURCES.internalMetricsStore);
    const severity = computeSeverity(conflict.kind, blastRadiusOf(conflict.resourceId));
    expect(severity).toBe("benign");
    const available = combinedAvailableInterventions(metricsEvidence(), NOW_T0);
    const [ruling] = arbitrate([conflict], [available], [severity], metricsParticipants());
    expect(ruling?.intervention).toEqual({ kind: "observe" });
    expect(ruling?.rule).toBe("severity-satisfied");
    expect(ruling?.escalationRecommended).toBe(false);
  });
});

describe("diagnostic-log-bucket — undeclared-access, bumped to contained severity, no legitimate claim to act on", () => {
  it("severity is bumped one step above what this resource's small blast radius alone would give", () => {
    const conflict = conflictOn(RESOURCES.diagnosticLogBucket);
    expect(conflict.kind).toBe("undeclared-access");
    const severity = computeSeverity(conflict.kind, blastRadiusOf(conflict.resourceId));
    expect(severity).toBe("contained"); // small -> benign, bumped once for undeclared-access.
  });

  it("with no legitimate claim on file, the gate can only offer the baseline — arbitrate falls back to warn, flagged for escalation", () => {
    const conflict = conflictOn(RESOURCES.diagnosticLogBucket);
    const severity = computeSeverity(conflict.kind, blastRadiusOf(conflict.resourceId));
    const available = combinedAvailableInterventions(undeclaredAccessEvidence(), NOW_T0);
    expect([...available].sort()).toEqual(["observe", "warn"]);
    const [ruling] = arbitrate([conflict], [available], [severity], undeclaredAccessParticipants());
    expect(ruling?.intervention.kind).toBe("warn");
    expect(ruling?.rule).toBe("gate-ceiling");
    expect(ruling?.escalationRecommended).toBe(true);
  });
});

describe("coverage — across this scenario's whole run, all five Intervention kinds and both halt modes actually fire", () => {
  it("observe, warn, pause, halt/checkpointed, halt/forced, and quarantine each appear at least once as a SELECTED ruling", () => {
    const checkout = conflictOn(RESOURCES.checkoutService);
    const sessionCache = conflictOn(RESOURCES.sessionCache);
    const featureFlags = conflictOn(RESOURCES.featureFlagConfig);
    const metrics = conflictOn(RESOURCES.internalMetricsStore);
    const undeclared = conflictOn(RESOURCES.diagnosticLogBucket);

    const checkoutAvailable = combinedAvailableInterventions(checkoutEvidence(), NOW_T0);
    const auth: HumanAuthorization = { authorizedBy: "ops-lead-jordan" as HumanId, conflictId: checkout.id };

    const rulings = [
      arbitrate([checkout], [checkoutAvailable], [computeSeverity(checkout.kind, blastRadiusOf(checkout.resourceId))], checkoutParticipants())[0],
      arbitrate([checkout], [checkoutAvailable], [computeSeverity(checkout.kind, blastRadiusOf(checkout.resourceId))], checkoutParticipants(), auth)[0],
      arbitrate([sessionCache], [combinedAvailableInterventions(sessionCacheEvidence(), NOW_T0)], [computeSeverity(sessionCache.kind, blastRadiusOf(sessionCache.resourceId))], sessionCacheParticipants())[0],
      arbitrate([featureFlags], [combinedAvailableInterventions(featureFlagsEvidence("before"), NOW_T0)], [computeSeverity(featureFlags.kind, blastRadiusOf(featureFlags.resourceId))], featureFlagsParticipants("before"))[0],
      arbitrate([featureFlags], [combinedAvailableInterventions(featureFlagsEvidence("after"), NOW_T1)], [computeSeverity(featureFlags.kind, blastRadiusOf(featureFlags.resourceId))], featureFlagsParticipants("after"))[0],
      arbitrate([metrics], [combinedAvailableInterventions(metricsEvidence(), NOW_T0)], [computeSeverity(metrics.kind, blastRadiusOf(metrics.resourceId))], metricsParticipants())[0],
      arbitrate([undeclared], [combinedAvailableInterventions(undeclaredAccessEvidence(), NOW_T0)], [computeSeverity(undeclared.kind, blastRadiusOf(undeclared.resourceId))], undeclaredAccessParticipants())[0],
    ];

    const seen = new Set(rulings.map((r) => (r!.intervention.kind === "halt" ? `halt-${r!.intervention.mode}` : r!.intervention.kind)));
    expect(seen).toEqual(new Set(["halt-checkpointed", "halt-forced", "quarantine", "warn", "pause", "observe"]));
  });
});
