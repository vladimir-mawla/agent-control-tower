import { describe, expect, it } from "vitest";
import { detectConflicts } from "../../../lib/conflict/index.js";
import { AGENTS, CLAIMS, HEARTBEATS, RESOURCES } from "../scenario.js";

/**
 * Plan §4 M6's own "what it refuses" bullet, verbatim: "to let two
 * remediation bots' conflicting claims on the same service go undetected
 * because they arrived through 'realistic,' differently-shaped domain
 * objects rather than the contrived fixtures M3–M5's own unit tests use."
 * This file is that proof, run against the real `detectConflicts` (M3,
 * frozen) over this scenario's own real `ResourceClaim[]`/`Heartbeat[]` —
 * no fixture helper, no shortcut.
 */
describe("detectConflicts over this scenario's real domain objects", () => {
  function conflicts() {
    const result = detectConflicts(CLAIMS, HEARTBEATS);
    if (!result.ok) throw new Error(`Unreachable: scenario claims/heartbeats are well-formed — detectConflicts should never fail here: ${result.error.message}`);
    return result.conflicts;
  }

  it("detects exactly five conflicts, one per resource this scenario collides over", () => {
    const found = conflicts();
    expect(found).toHaveLength(5);
    const resourceIds = new Set(found.map((c) => String(c.resourceId)));
    expect(resourceIds).toEqual(
      new Set([
        String(RESOURCES.checkoutService),
        String(RESOURCES.sessionCache),
        String(RESOURCES.featureFlagConfig),
        String(RESOURCES.internalMetricsStore),
        String(RESOURCES.diagnosticLogBucket),
      ]),
    );
  });

  it("checkout-service is write-write between RollbackBot and AutoScaler", () => {
    const c = conflicts().find((x) => String(x.resourceId) === String(RESOURCES.checkoutService));
    expect(c?.kind).toBe("write-write");
    expect(c?.agentIds.map(String).sort()).toEqual([AGENTS.autoScaler, AGENTS.rollbackBot].map(String).sort());
  });

  it("session-cache is write-read between AutoScaler (write) and CacheFlusher (read)", () => {
    const c = conflicts().find((x) => String(x.resourceId) === String(RESOURCES.sessionCache));
    expect(c?.kind).toBe("write-read");
    expect(c?.agentIds.map(String).sort()).toEqual([AGENTS.autoScaler, AGENTS.cacheFlusher].map(String).sort());
  });

  it("feature-flag-config is write-write between AutoScaler and RollbackBot", () => {
    const c = conflicts().find((x) => String(x.resourceId) === String(RESOURCES.featureFlagConfig));
    expect(c?.kind).toBe("write-write");
    expect(c?.agentIds.map(String).sort()).toEqual([AGENTS.autoScaler, AGENTS.rollbackBot].map(String).sort());
  });

  it("internal-metrics-store is write-write between AutoScaler and CacheFlusher", () => {
    const c = conflicts().find((x) => String(x.resourceId) === String(RESOURCES.internalMetricsStore));
    expect(c?.kind).toBe("write-write");
    expect(c?.agentIds.map(String).sort()).toEqual([AGENTS.autoScaler, AGENTS.cacheFlusher].map(String).sort());
  });

  it("diagnostic-log-bucket is undeclared-access by CacheFlusher alone — no claim on file for that pair", () => {
    const c = conflicts().find((x) => String(x.resourceId) === String(RESOURCES.diagnosticLogBucket));
    expect(c?.kind).toBe("undeclared-access");
    expect(c?.agentIds.map(String)).toEqual([AGENTS.cacheFlusher].map(String));
  });

  it("is order-independent over this scenario's own real data — shuffled claims/heartbeats produce the identical result", () => {
    const shuffledClaims = [...CLAIMS].reverse();
    const shuffledHeartbeats = [...HEARTBEATS].reverse();
    const result = detectConflicts(shuffledClaims, shuffledHeartbeats);
    expect(result).toEqual(detectConflicts(CLAIMS, HEARTBEATS));
  });
});
