import assert from "node:assert/strict";
import { assertNeverIntervention, type HumanId, type Intervention } from "../lib/contracts/index.js";
import { detectConflicts, type DetectedConflict } from "../lib/conflict/index.js";
import { arbitrate, type ArbitrationParticipant, type HumanAuthorization, type InterventionRuling } from "../lib/arbitrate/index.js";
import type { AvailableInterventionSet } from "../lib/gate/index.js";
import {
  AGENTS,
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
} from "../domains/incident-response/index.js";

/**
 * `scripts/demo-incident.ts` — `.genesis/PLAN.md`'s own M6 falsifiability
 * check, verbatim: "`npm run demo:incident` runs a realistic scenario
 * ... and prints, per step, the claims in force, the detected conflict,
 * the gate's permitted set, and the final ruling. All five `Intervention`
 * top-level kinds and both `halt` modes appear at least once across the
 * run — checked by the script's own exit code, not eyeballed."
 *
 * EVERY VALUE PRINTED BELOW IS READ OFF A REAL RETURN VALUE FROM THE REAL
 * ENGINE (`detectConflicts`, `combinedAvailableInterventions` — this
 * milestone's own thin wrapper around the real, frozen `availableInterventions`
 * — and `arbitrate`), never a hardcoded string asserted independently of
 * the call whose result it claims to describe. `assertRuling` below
 * throws (non-zero exit) the moment a step's real ruling disagrees with
 * what this script's own narration is about to print — the identical
 * discipline `~/Desktop/memory-ledger/scripts/demo-memory.ts`'s own
 * `assertVariant` already uses, copied in shape, not in content (this
 * project's own scenario and engine are unrelated to that one's).
 *
 * See this milestone's own build report for the sabotage experiment that
 * proves this: flipping `domains/incident-response/gate-aggregation.ts`'s
 * intersection to a union changes a concrete assertion failure here (and
 * in `__tests__/end-to-end.test.ts`), not just this script's prose.
 */

let stepNumber = 0;
function step(title: string): void {
  stepNumber += 1;
  console.log(`\n--- Step ${stepNumber}: ${title} ---`);
}

function describeIntervention(intervention: Intervention): string {
  switch (intervention.kind) {
    case "observe":
      return "OBSERVE";
    case "warn":
      return `WARN — "${intervention.message}"`;
    case "pause":
      return `PAUSE (checkpoint ${String(intervention.checkpointId)})`;
    case "halt":
      switch (intervention.mode) {
        case "checkpointed":
          return `HALT/CHECKPOINTED (checkpoint ${String(intervention.checkpointId)}, best-effort resumable)`;
        case "forced":
          return `HALT/FORCED (authorized by ${String(intervention.authorizedBy)}, conflict ${String(intervention.conflictId)})`;
        default:
          return assertNeverIntervention(intervention);
      }
    case "quarantine":
      return `QUARANTINE (revoking: ${intervention.revokedClaims.map(String).join(", ")})`;
    default:
      return assertNeverIntervention(intervention);
  }
}

function printConflict(conflict: DetectedConflict): void {
  console.log(`  Detected conflict: ${conflict.kind} on ${String(conflict.resourceId)} (id ${String(conflict.id)})`);
  console.log(`    agents: ${conflict.agentIds.map(String).join(", ")}`);
}

function printAvailable(available: ReadonlySet<string>): void {
  console.log(`  Gate permits: {${[...available].sort().join(", ")}}`);
}

function printRuling(ruling: InterventionRuling): void {
  console.log(`  Ruling: ${describeIntervention(ruling.intervention)}`);
  console.log(
    `    rule: ${ruling.rule} | escalationRecommended: ${ruling.escalationRecommended} | severity: ${ruling.evidence.severity} | required floor: ${ruling.evidence.requiredMinimumRung} | selected rung: ${ruling.evidence.selectedRung}`,
  );
}

interface RulingKindCheck {
  readonly kind: Intervention["kind"];
  readonly mode?: "checkpointed" | "forced";
}

function assertRuling(ruling: InterventionRuling | undefined, expected: RulingKindCheck, label: string): InterventionRuling {
  assert.ok(ruling, `${label}: expected a ruling, got none`);
  assert.equal(ruling.intervention.kind, expected.kind, `${label}: expected intervention.kind "${expected.kind}", got "${ruling.intervention.kind}"`);
  if (expected.mode !== undefined) {
    assert.equal(ruling.intervention.kind, "halt", `${label}: expected a halt to check its mode`);
    if (ruling.intervention.kind === "halt") {
      assert.equal(ruling.intervention.mode, expected.mode, `${label}: expected halt mode "${expected.mode}", got "${ruling.intervention.mode}"`);
    }
  }
  return ruling;
}

const observedKinds = new Set<string>();
function trackKind(ruling: InterventionRuling): void {
  const label = ruling.intervention.kind === "halt" ? `halt-${ruling.intervention.mode}` : ruling.intervention.kind;
  observedKinds.add(label);
}

function ruleOn(
  conflict: DetectedConflict,
  available: AvailableInterventionSet,
  participants: readonly ArbitrationParticipant[],
  humanAuthorization?: HumanAuthorization,
): InterventionRuling {
  const severity = computeSeverity(conflict.kind, blastRadiusOf(conflict.resourceId));
  const [ruling] = arbitrate([conflict], [available], [severity], participants, humanAuthorization);
  if (ruling === undefined) throw new Error("Unreachable: arbitrate() returned no ruling for a single input conflict.");
  return ruling;
}

async function main(): Promise<void> {
  console.log("Agent Control Tower — M6 domain demo: three concurrent incident-remediation agents");
  console.log(`Agents: AutoScaler (${String(AGENTS.autoScaler)}), RollbackBot (${String(AGENTS.rollbackBot)}), CacheFlusher (${String(AGENTS.cacheFlusher)})`);

  step("Detect every conflict across the whole incident (one real detectConflicts call over every declared claim and heartbeat)");
  const detection = detectConflicts(CLAIMS, HEARTBEATS);
  assert.equal(detection.ok, true, "scenario claims/heartbeats are well-formed and must not produce a hostile-input failure");
  if (!detection.ok) throw new Error("unreachable");
  const allConflicts = detection.conflicts;
  console.log(`  ${allConflicts.length} conflicts detected:`);
  for (const c of allConflicts) printConflict(c);
  assert.equal(allConflicts.length, 5, "expected exactly five conflicts across this scenario");

  function conflictOn(resource: (typeof RESOURCES)[keyof typeof RESOURCES]): DetectedConflict {
    const found = allConflicts.find((c) => String(c.resourceId) === String(resource));
    if (found === undefined) throw new Error(`Unreachable: no detected conflict for ${String(resource)}`);
    return found;
  }

  // ---- checkout-service: the headline moment — gate-ceiling, then human-forced-escalation ----
  step("checkout-service (write-write, large blast radius -> corrupting severity): RollbackBot self-reported, AutoScaler cross-checked, both on a fresh, shared checkpoint");
  const checkout = conflictOn(RESOURCES.checkoutService);
  printConflict(checkout);
  const checkoutAvailable = combinedAvailableInterventions(checkoutEvidence(), NOW_T0);
  printAvailable(checkoutAvailable);
  assert.equal(checkoutAvailable.has("quarantine"), false, "RollbackBot's own claim is still self-reported — it must withhold quarantine for the whole conflict even though AutoScaler's is cross-checked");
  assert.equal(checkoutAvailable.has("halt-checkpointed"), true, "a fresh, shared checkpoint must grant halt-checkpointed");
  console.log("  -> corrupting severity demands quarantine; the gate cannot offer it (RollbackBot's own claim is only self-reported — one agent's better evidence does not license revoking the OTHER agent's self-reported claim). No human authorization is present yet.");
  const noAuthRuling = assertRuling(ruleOn(checkout, checkoutAvailable, checkoutParticipants()), { kind: "halt", mode: "checkpointed" }, "checkout/no-auth");
  printRuling(noAuthRuling);
  assert.equal(noAuthRuling.escalationRecommended, true, "the tower must decline to force-halt and flag escalation instead");
  trackKind(noAuthRuling);

  step("checkout-service, RE-RUN with a human authorization scoped to this exact conflict — the project's whole claim, demonstrated as a contrast");
  const auth: HumanAuthorization = { authorizedBy: "ops-lead-jordan" as HumanId, conflictId: checkout.id };
  console.log(`  Human authorization supplied: authorizedBy=${String(auth.authorizedBy)}, conflictId=${String(auth.conflictId)}`);
  const withAuthRuling = assertRuling(ruleOn(checkout, checkoutAvailable, checkoutParticipants(), auth), { kind: "halt", mode: "forced" }, "checkout/with-auth");
  printRuling(withAuthRuling);
  assert.equal(withAuthRuling.escalationRecommended, false, "a human has acted — nothing further to escalate");
  trackKind(withAuthRuling);

  step("checkout-service, RE-RUN with an authorization scoped to a DIFFERENT conflict — must be refused, not silently reused");
  const sessionCacheForWrongAuth = conflictOn(RESOURCES.sessionCache);
  const wrongAuth: HumanAuthorization = { authorizedBy: "ops-lead-jordan" as HumanId, conflictId: sessionCacheForWrongAuth.id };
  const wrongAuthRuling = assertRuling(ruleOn(checkout, checkoutAvailable, checkoutParticipants(), wrongAuth), { kind: "halt", mode: "checkpointed" }, "checkout/wrong-auth");
  printRuling(wrongAuthRuling);
  console.log("  -> a valid authorization for a DIFFERENT conflict does not unlock halt/forced here — identical ruling to the no-auth run.");
  assert.deepEqual(wrongAuthRuling.intervention, noAuthRuling.intervention, "a mismatched authorization must not change the outcome at all");

  // ---- session-cache: checkpoint withheld, quarantine proportionate ----
  step("session-cache (write-read, medium blast radius -> contained severity): cross-checked corroboration, no usable checkpoint");
  const sessionCache = conflictOn(RESOURCES.sessionCache);
  printConflict(sessionCache);
  const sessionCacheAvailable = combinedAvailableInterventions(sessionCacheEvidence(), NOW_T0);
  printAvailable(sessionCacheAvailable);
  assert.equal(sessionCacheAvailable.has("pause"), false, "no usable checkpoint must withhold pause");
  assert.equal(sessionCacheAvailable.has("halt-checkpointed"), false, "no usable checkpoint must withhold halt-checkpointed");
  assert.equal(sessionCacheAvailable.has("quarantine"), true, "cross-checked corroboration must grant quarantine");
  const sessionCacheRuling = assertRuling(ruleOn(sessionCache, sessionCacheAvailable, sessionCacheParticipants()), { kind: "quarantine" }, "session-cache");
  printRuling(sessionCacheRuling);
  trackKind(sessionCacheRuling);

  // ---- feature-flag-config: evidence improving over time ----
  step("feature-flag-config (write-write, medium blast radius -> contained severity), BEFORE a checkpoint has been declared");
  const featureFlags = conflictOn(RESOURCES.featureFlagConfig);
  printConflict(featureFlags);
  const beforeAvailable = combinedAvailableInterventions(featureFlagsEvidence("before"), NOW_T0);
  printAvailable(beforeAvailable);
  const beforeRuling = assertRuling(ruleOn(featureFlags, beforeAvailable, featureFlagsParticipants("before")), { kind: "warn" }, "feature-flags/before");
  printRuling(beforeRuling);
  assert.equal(beforeRuling.escalationRecommended, true);
  trackKind(beforeRuling);

  step("feature-flag-config, 5 minutes later: a fresh, shared checkpoint has since appeared");
  const afterAvailable = combinedAvailableInterventions(featureFlagsEvidence("after"), NOW_T1);
  printAvailable(afterAvailable);
  const afterRuling = assertRuling(ruleOn(featureFlags, afterAvailable, featureFlagsParticipants("after")), { kind: "pause" }, "feature-flags/after");
  printRuling(afterRuling);
  console.log("  -> pause, not the also-available halt-checkpointed: arbitration picks the WEAKEST option that meets the floor, never a stronger one merely because it is available.");
  assert.equal(afterRuling.escalationRecommended, false);
  trackKind(afterRuling);

  // ---- internal-metrics-store: genuinely benign ----
  step("internal-metrics-store (write-write, small blast radius -> benign severity): observe is already adequate");
  const metrics = conflictOn(RESOURCES.internalMetricsStore);
  printConflict(metrics);
  const metricsAvailable = combinedAvailableInterventions(metricsEvidence(), NOW_T0);
  printAvailable(metricsAvailable);
  const metricsRuling = assertRuling(ruleOn(metrics, metricsAvailable, metricsParticipants()), { kind: "observe" }, "metrics");
  printRuling(metricsRuling);
  trackKind(metricsRuling);

  // ---- diagnostic-log-bucket: undeclared access, no legitimate claim ----
  step("diagnostic-log-bucket (undeclared-access): CacheFlusher touched it with no claim on file at all");
  const undeclared = conflictOn(RESOURCES.diagnosticLogBucket);
  printConflict(undeclared);
  const undeclaredSeverity = computeSeverity(undeclared.kind, blastRadiusOf(undeclared.resourceId));
  console.log(`  -> severity bumped to "${undeclaredSeverity}" — undeclared access is never treated as weaker than a real, declared collision on the same resource.`);
  const undeclaredAvailable = combinedAvailableInterventions(undeclaredAccessEvidence(), NOW_T0);
  printAvailable(undeclaredAvailable);
  const undeclaredRuling = assertRuling(ruleOn(undeclared, undeclaredAvailable, undeclaredAccessParticipants()), { kind: "warn" }, "undeclared-access");
  printRuling(undeclaredRuling);
  assert.equal(undeclaredRuling.escalationRecommended, true, "no legitimate claim exists — the tower cannot do more than warn and flag escalation");
  trackKind(undeclaredRuling);

  console.log("\n=== Summary ===");
  console.log(`Intervention kinds observed: ${[...observedKinds].sort().join(", ")}`);
  const expectedKinds: readonly string[] = ["halt-checkpointed", "halt-forced", "observe", "pause", "quarantine", "warn"];
  for (const kind of expectedKinds) {
    assert.ok(observedKinds.has(kind), `expected the demo run to select intervention "${kind}" at least once`);
  }
  console.log("All five Intervention kinds and both halt modes were selected at least once. Demo complete.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
