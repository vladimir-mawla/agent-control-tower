import { describe, expect, it } from "vitest";
import { checkpointId, conflictId, resourceClaimId, type HumanId, type Intervention } from "../../../lib/contracts/index.js";
import { formatInterventionDetail, formatInterventionHeadline, formatRule } from "../format-intervention.js";

describe("formatInterventionHeadline / formatInterventionDetail — exhaustive over every Intervention shape", () => {
  it("observe", () => {
    const value: Intervention = { kind: "observe" };
    expect(formatInterventionHeadline(value)).toBe("OBSERVE");
    expect(formatInterventionDetail(value)).toContain("floor");
  });

  it("warn — detail is exactly the engine's own message, not a paraphrase", () => {
    const value: Intervention = { kind: "warn", message: "conflict xyz on resource abc" };
    expect(formatInterventionHeadline(value)).toBe("WARN");
    expect(formatInterventionDetail(value)).toBe("conflict xyz on resource abc");
  });

  it("pause", () => {
    const value: Intervention = { kind: "pause", checkpointId: checkpointId("cp-1") };
    expect(formatInterventionHeadline(value)).toBe("PAUSE");
    expect(formatInterventionDetail(value)).toContain("cp-1");
  });

  it("halt/checkpointed", () => {
    const value: Intervention = { kind: "halt", mode: "checkpointed", checkpointId: checkpointId("cp-2") };
    expect(formatInterventionHeadline(value)).toBe("HALT — checkpointed");
    expect(formatInterventionDetail(value)).toContain("cp-2");
  });

  it("halt/forced", () => {
    const value: Intervention = {
      kind: "halt",
      mode: "forced",
      authorizedBy: "ops-lead-jordan" as HumanId,
      conflictId: conflictId("conflict-1"),
    };
    expect(formatInterventionHeadline(value)).toBe("HALT — forced");
    const detail = formatInterventionDetail(value);
    expect(detail).toContain("ops-lead-jordan");
    expect(detail).toContain("conflict-1");
  });

  it("quarantine", () => {
    const value: Intervention = { kind: "quarantine", revokedClaims: [resourceClaimId("claim-1"), resourceClaimId("claim-2")] };
    expect(formatInterventionHeadline(value)).toBe("QUARANTINE");
    const detail = formatInterventionDetail(value);
    expect(detail).toContain("claim-1");
    expect(detail).toContain("claim-2");
  });
});

describe("formatRule", () => {
  it("returns a distinct, non-empty label for every ArbitrationRule", () => {
    const rules = [
      "severity-satisfied",
      "gate-ceiling",
      "checkpoint-unrealizable",
      "quarantine-unrealizable",
      "human-forced-escalation",
    ] as const;
    const labels = rules.map((rule) => formatRule(rule));
    expect(new Set(labels).size).toBe(rules.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });
});
