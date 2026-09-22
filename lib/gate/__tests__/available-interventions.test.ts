import { describe, expect, it } from "vitest";
import { agentId } from "../../contracts/ids.js";
import { timestamp } from "../../contracts/timestamp.js";
import { STALENESS_BOUND_MS } from "../clock.js";
import {
  ALL_AVAILABLE_INTERVENTION_KINDS,
  availableInterventions,
  type AvailableInterventionKind,
  type AvailableInterventionSet,
} from "../available-interventions.js";
import { buildCheckpoint, buildClaim } from "./fixtures.js";

const T0 = "2026-09-22T00:00:00.000Z";
const plusMs = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();

describe("availableInterventions — the baseline: observe/warn are never withheld, no matter what", () => {
  it("a self-reported claim with an unreachable checkpoint still permits observe and warn", () => {
    const claim = buildClaim({ corroboration: "self-reported" });
    const checkpoint = buildCheckpoint({ reachable: false });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result.has("observe")).toBe(true);
    expect(result.has("warn")).toBe(true);
  });

  it("even a fully mismatched agent still permits observe and warn (see the agent-identity describe block below)", () => {
    const claim = buildClaim({ agent: "agent-a", corroboration: "independently-verified" });
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const result = availableInterventions(agentId("agent-b"), claim, checkpoint, timestamp(T0));
    expect(result).toEqual(new Set(["observe", "warn"]));
  });
});

describe("availableInterventions — quarantine gated on corroboration alone", () => {
  it("refuses quarantine when the claim's corroboration is self-reported (plan §2, verbatim)", () => {
    const claim = buildClaim({ corroboration: "self-reported" });
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result.has("quarantine")).toBe(false);
  });

  it("offers quarantine when the claim is cross-checked", () => {
    const claim = buildClaim({ corroboration: "cross-checked" });
    const checkpoint = buildCheckpoint({ reachable: false });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result.has("quarantine")).toBe(true);
  });

  it("offers quarantine when the claim is independently-verified", () => {
    const claim = buildClaim({ corroboration: "independently-verified" });
    const checkpoint = buildCheckpoint({ reachable: false });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result.has("quarantine")).toBe(true);
  });
});

describe("availableInterventions — pause and halt-checkpointed gated on checkpoint freshness alone", () => {
  it("both drop out when the checkpoint is not reachable", () => {
    const claim = buildClaim();
    const checkpoint = buildCheckpoint({ reachable: false, declaredAt: T0 });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result.has("pause")).toBe(false);
    expect(result.has("halt-checkpointed")).toBe(false);
  });

  it("both drop out once the checkpoint is stale beyond the configured bound", () => {
    const claim = buildClaim();
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const now = timestamp(plusMs(STALENESS_BOUND_MS + 1));
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, now);
    expect(result.has("pause")).toBe(false);
    expect(result.has("halt-checkpointed")).toBe(false);
  });

  it("both are available at exactly the staleness boundary (N vs N+1, the same discipline as clock.test.ts)", () => {
    const claim = buildClaim();
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const now = timestamp(plusMs(STALENESS_BOUND_MS));
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, now);
    expect(result.has("pause")).toBe(true);
    expect(result.has("halt-checkpointed")).toBe(true);
  });

  it("both are available when the checkpoint is reachable and fresh", () => {
    const claim = buildClaim();
    const checkpoint = buildCheckpoint({ reachable: true, declaredAt: T0 });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result.has("pause")).toBe(true);
    expect(result.has("halt-checkpointed")).toBe(true);
  });
});

describe("availableInterventions — the two gating axes are independent (corroboration never affects pause/halt-checkpointed; freshness never affects quarantine)", () => {
  it("a self-reported, freshly-checkpointed claim gets pause/halt-checkpointed but not quarantine", () => {
    const claim = buildClaim({ corroboration: "self-reported" });
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result).toEqual(new Set(["observe", "warn", "pause", "halt-checkpointed"]));
  });

  it("a cross-checked claim with an unreachable checkpoint gets quarantine but not pause/halt-checkpointed", () => {
    const claim = buildClaim({ corroboration: "cross-checked" });
    const checkpoint = buildCheckpoint({ reachable: false });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result).toEqual(new Set(["observe", "warn", "quarantine"]));
  });

  it("an independently-verified claim with a fresh checkpoint gets all five kinds", () => {
    const claim = buildClaim({ corroboration: "independently-verified" });
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result).toEqual(new Set(ALL_AVAILABLE_INTERVENTION_KINDS));
  });

  it("a self-reported claim with a stale, unreachable checkpoint gets only the baseline", () => {
    const claim = buildClaim({ corroboration: "self-reported" });
    const checkpoint = buildCheckpoint({ reachable: false, declaredAt: T0 });
    const now = timestamp(plusMs(STALENESS_BOUND_MS + 1));
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, now);
    expect(result).toEqual(new Set(["observe", "warn"]));
  });
});

describe("availableInterventions — agent identity: a claim belonging to a different agent than asked about fails closed to the baseline only", () => {
  it("does not leak pause/halt-checkpointed/quarantine when the claim's own agentId doesn't match the agent parameter, even if every other condition is maximally permissive", () => {
    const claim = buildClaim({ agent: "agent-a", corroboration: "independently-verified" });
    const checkpoint = buildCheckpoint({ reachable: true, declaredAt: T0 });
    const result = availableInterventions(agentId("agent-mismatch"), claim, checkpoint, timestamp(T0));
    expect(result).toEqual(new Set(["observe", "warn"]));
  });

  it("a matching agent, all else equal, is unaffected by this check", () => {
    const claim = buildClaim({ agent: "agent-a", corroboration: "independently-verified" });
    const checkpoint = buildCheckpoint({ reachable: true, declaredAt: T0 });
    const result = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result).toEqual(new Set(ALL_AVAILABLE_INTERVENTION_KINDS));
  });
});

describe("availableInterventions — the returned value is a real Set, matching the closed vocabulary exactly", () => {
  it("ALL_AVAILABLE_INTERVENTION_KINDS names exactly five kinds, no more, no fewer", () => {
    expect(ALL_AVAILABLE_INTERVENTION_KINDS).toHaveLength(5);
    expect(new Set(ALL_AVAILABLE_INTERVENTION_KINDS).size).toBe(5);
  });

  it("the result supports Set methods directly (has/size), never needs to be re-wrapped by a caller", () => {
    const claim = buildClaim({ corroboration: "independently-verified" });
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const result: AvailableInterventionSet = availableInterventions(agentId("agent-a"), claim, checkpoint, timestamp(T0));
    expect(result.size).toBe(5);
    for (const kind of ALL_AVAILABLE_INTERVENTION_KINDS) {
      expect(result.has(kind)).toBe(true);
    }
  });
});

describe("TYPE-LEVEL: AvailableInterventionKind has structurally no slot for the human-authorized halt mode", () => {
  it("assigning that mode's own string literal to AvailableInterventionKind does not compile", () => {
    // @ts-expect-error — "halt-forced" is not, and cannot be, a member of AvailableInterventionKind; this is the type-level half of this milestone's central commitment.
    const impossible: AvailableInterventionKind = "halt-forced";
    expect(impossible).toBeDefined();
  });

  it("the bare literal that would name that mode, alone, also does not compile", () => {
    // @ts-expect-error — the string this mode's own field would carry has no home in this closed union at all.
    const impossible: AvailableInterventionKind = "forced";
    expect(impossible).toBeDefined();
  });

  it("even the unmoded 'halt' literal Intervention['kind'] itself uses does not compile — this union deliberately never reaches that ambiguous a state", () => {
    // @ts-expect-error — "halt" alone is not a member; this file adds back exactly one halt-shaped literal ("halt-checkpointed"), and only that one.
    const impossible: AvailableInterventionKind = "halt";
    expect(impossible).toBeDefined();
  });

  it("constructing a Set typed as AvailableInterventionSet with that mode's own literal requires an explicit, visible cast — never a plain literal", () => {
    // @ts-expect-error — the array literal's element type cannot satisfy AvailableInterventionKind without a cast.
    const impossible: AvailableInterventionSet = new Set<AvailableInterventionKind>(["forced"]);
    expect(impossible).toBeDefined();
  });
});
