import { describe, expect, it } from "vitest";
import { agentId, checkpointId, resourceId, timestamp, type CheckpointDeclaration, type ResourceClaim } from "../../../lib/contracts/index.js";
import { availableInterventions } from "../../../lib/gate/index.js";
import { combinedAvailableInterventions, noLegitimateClaimEvidence, NO_LEGITIMATE_CLAIM_AGENT, type ClaimEvidence } from "../gate-aggregation.js";

const NOW = timestamp("2026-09-22T10:00:00.000Z");
const FRESH_DECLARED = timestamp("2026-09-22T09:58:00.000Z"); // 2 minutes before NOW — inside the 5-minute staleness bound.
const RESOURCE = resourceId("some-resource");

function claim(agent: ReturnType<typeof agentId>, corroboration: ResourceClaim["corroboration"]): ResourceClaim {
  return { agentId: agent, resourceId: RESOURCE, mode: "write", declaredAt: NOW, ttl: 60_000, corroboration };
}

function freshCheckpoint(): CheckpointDeclaration {
  return { reachable: true, resumable: true, checkpointId: checkpointId("cp-1"), declaredAt: FRESH_DECLARED };
}

function noCheckpoint(): CheckpointDeclaration {
  return { reachable: false, resumable: false, checkpointId: checkpointId("cp-none"), declaredAt: NOW };
}

describe("combinedAvailableInterventions — intersection across every relevant participant's own, individually-evaluated evidence", () => {
  it("matches the real availableInterventions' own single-claim result when only one participant is relevant", () => {
    const agent = agentId("solo-agent");
    const evidence: ClaimEvidence[] = [{ agentId: agent, claim: claim(agent, "cross-checked"), checkpoint: freshCheckpoint() }];
    const combined = combinedAvailableInterventions(evidence, NOW);
    const solo = availableInterventions(agent, claim(agent, "cross-checked"), freshCheckpoint(), NOW);
    expect(combined).toEqual(solo);
  });

  it("one self-reported participant excludes quarantine for the WHOLE conflict, even if every other participant is cross-checked", () => {
    const a = agentId("agent-a");
    const b = agentId("agent-b");
    const evidence: ClaimEvidence[] = [
      { agentId: a, claim: claim(a, "self-reported"), checkpoint: noCheckpoint() },
      { agentId: b, claim: claim(b, "independently-verified"), checkpoint: noCheckpoint() },
    ];
    const combined = combinedAvailableInterventions(evidence, NOW);
    expect(combined.has("quarantine")).toBe(false);
  });

  it("every participant cross-checked (or better) includes quarantine", () => {
    const a = agentId("agent-a");
    const b = agentId("agent-b");
    const evidence: ClaimEvidence[] = [
      { agentId: a, claim: claim(a, "cross-checked"), checkpoint: noCheckpoint() },
      { agentId: b, claim: claim(b, "independently-verified"), checkpoint: noCheckpoint() },
    ];
    expect(combinedAvailableInterventions(evidence, NOW).has("quarantine")).toBe(true);
  });

  it("one participant with a stale/unreachable checkpoint excludes pause and halt-checkpointed for the whole conflict, even if the other's is fresh", () => {
    const a = agentId("agent-a");
    const b = agentId("agent-b");
    const evidence: ClaimEvidence[] = [
      { agentId: a, claim: claim(a, "self-reported"), checkpoint: freshCheckpoint() },
      { agentId: b, claim: claim(b, "self-reported"), checkpoint: noCheckpoint() },
    ];
    const combined = combinedAvailableInterventions(evidence, NOW);
    expect(combined.has("pause")).toBe(false);
    expect(combined.has("halt-checkpointed")).toBe(false);
  });

  it("observe and warn survive every intersection, unconditionally", () => {
    const a = agentId("agent-a");
    const evidence: ClaimEvidence[] = [{ agentId: a, claim: claim(a, "self-reported"), checkpoint: noCheckpoint() }];
    const combined = combinedAvailableInterventions(evidence, NOW);
    expect(combined.has("observe")).toBe(true);
    expect(combined.has("warn")).toBe(true);
  });

  it("an empty evidence array (no relevant participant at all) still returns the baseline, never an empty set", () => {
    expect(combinedAvailableInterventions([], NOW)).toEqual(new Set(["observe", "warn"]));
  });
});

describe("noLegitimateClaimEvidence — the honest translation of 'no claim exists' into availableInterventions' own agent-mismatch guard", () => {
  it("produces exactly the baseline {observe, warn} for the real, frozen gate — proving the mismatch branch, not a domain shortcut, drives this", () => {
    const offendingAgent = agentId("undeclared-toucher");
    const evidence = noLegitimateClaimEvidence(offendingAgent, RESOURCE, NOW);
    expect(evidence.agentId).toBe(offendingAgent);
    expect(evidence.claim.agentId).toBe(NO_LEGITIMATE_CLAIM_AGENT);
    expect(evidence.claim.agentId).not.toBe(offendingAgent);
    const result = availableInterventions(evidence.agentId, evidence.claim, evidence.checkpoint, NOW);
    expect(result).toEqual(new Set(["observe", "warn"]));
  });

  /**
   * FALSIFIABILITY: proves the sentinel claim's own field values are
   * inert — only the agent-identity mismatch drives the baseline result.
   * If a future edit accidentally routed corroboration/mode/ttl into the
   * decision (e.g. by fixing the sentinel's `agentId` to match the real
   * agent), this test would start failing the moment any of these fields
   * changed the outcome, which they must not.
   */
  it("the sentinel claim's mode/ttl/corroboration never influence the result — mutating any of them changes nothing", () => {
    const offendingAgent = agentId("undeclared-toucher");
    const base = noLegitimateClaimEvidence(offendingAgent, RESOURCE, NOW);
    const mutated: ClaimEvidence = {
      ...base,
      claim: { ...base.claim, mode: "exclusive", ttl: 999_999, corroboration: "independently-verified" },
    };
    const baseResult = availableInterventions(base.agentId, base.claim, base.checkpoint, NOW);
    const mutatedResult = availableInterventions(mutated.agentId, mutated.claim, mutated.checkpoint, NOW);
    expect(mutatedResult).toEqual(baseResult);
    expect(mutatedResult).toEqual(new Set(["observe", "warn"]));
  });
});
