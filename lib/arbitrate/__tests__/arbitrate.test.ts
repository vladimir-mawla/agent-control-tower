import { describe, expect, it } from "vitest";
import { arbitrate } from "../arbitrate.js";
import { rungRank } from "../severity-ladder.js";
import { availableSet, conflict, humanAuthorization, participant } from "./fixtures.js";

describe("arbitrate — proportionality: the WEAKEST available-and-realizable rung that meets severity's floor, never gratuitously stronger", () => {
  it("benign severity always picks observe, even when stronger kinds are available", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause", "halt-checkpointed", "quarantine"])],
      ["benign"],
      [participant("agent-a", "resource-1", "claim-a", { checkpoint: "cp-1" }), participant("agent-b", "resource-1", "claim-b", { checkpoint: "cp-1" })],
    );
    expect(ruling!.intervention).toEqual({ kind: "observe" });
    expect(ruling!.rule).toBe("severity-satisfied");
    expect(ruling!.escalationRecommended).toBe(false);
  });

  it("contained severity with pause and quarantine both available+realizable picks pause (the weaker one that already meets the floor), not quarantine", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause", "quarantine"])],
      ["contained"],
      [
        participant("agent-a", "resource-1", "claim-a", { checkpoint: "cp-1" }),
        participant("agent-b", "resource-1", "claim-b", { checkpoint: "cp-1" }),
      ],
    );
    expect(ruling!.intervention).toEqual({ kind: "pause", checkpointId: "cp-1" });
    expect(ruling!.rule).toBe("severity-satisfied");
    expect(ruling!.escalationRecommended).toBe(false);
  });

  it("corrupting severity with quarantine available+realizable picks quarantine", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause", "quarantine"])],
      ["corrupting"],
      [
        participant("agent-a", "resource-1", "claim-a", { checkpoint: "cp-1" }),
        participant("agent-b", "resource-1", "claim-b", { checkpoint: "cp-1" }),
      ],
    );
    expect(ruling!.intervention).toEqual({ kind: "quarantine", revokedClaims: ["claim-a", "claim-b"] });
    expect(ruling!.rule).toBe("severity-satisfied");
    expect(ruling!.escalationRecommended).toBe(false);
  });

  /**
   * THE PLAN'S OWN WORKED EXAMPLE, VERBATIM (`.genesis/PLAN.md` §4 M5's
   * own falsifiability check): "a `corrupting`-severity conflict where
   * M4's gate permits only `warn` ... confirms `arbitrate` returns `warn`
   * plus `escalationRecommended: true` — not a fabricated `quarantine`,
   * and not a bare `warn` that looks like the system judged the situation
   * adequately handled."
   */
  it("corrupting severity where the gate permits only observe/warn returns warn, not a fabricated quarantine, plus escalationRecommended: true", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    const [ruling] = arbitrate([c], [availableSet(["observe", "warn"])], ["corrupting"], []);
    expect(ruling!.intervention.kind).toBe("warn");
    expect(ruling!.rule).toBe("gate-ceiling");
    expect(ruling!.escalationRecommended).toBe(true);
    expect(ruling!.evidence.requiredMinimumRung).toBe("quarantine");
    expect(ruling!.evidence.selectedRung).toBe("warn");
  });

  it("never reports a corrupting conflict as bare observe (the severity floor) — warn is always at least as strong as whatever is available", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    const [ruling] = arbitrate([c], [availableSet(["observe", "warn"])], ["corrupting"], []);
    expect(ruling!.intervention.kind).not.toBe("observe");
  });
});

describe("arbitrate — realizability degradation: the gate says a kind is available, but this milestone's own data cannot realize it", () => {
  it("quarantine available but no participant claim resolvable for this conflict — falls back to warn with rule quarantine-unrealizable, escalationRecommended: true, and never fabricates a quarantine with an empty revokedClaims", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    const [ruling] = arbitrate([c], [availableSet(["observe", "warn", "quarantine"])], ["corrupting"], []);
    expect(ruling!.intervention.kind).toBe("warn");
    expect(ruling!.rule).toBe("quarantine-unrealizable");
    expect(ruling!.escalationRecommended).toBe(true);
  });

  it("pause available but participants disagree on checkpointId — falls back rather than guessing which one is right", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause"])],
      ["contained"],
      [
        participant("agent-a", "resource-1", "claim-a", { checkpoint: "cp-1" }),
        participant("agent-b", "resource-1", "claim-b", { checkpoint: "cp-2" }),
      ],
    );
    expect(ruling!.intervention.kind).toBe("warn");
    expect(ruling!.rule).toBe("checkpoint-unrealizable");
    expect(ruling!.escalationRecommended).toBe(true);
  });

  it("pause available but no participant declared any checkpoint at all — falls back", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause"])],
      ["contained"],
      [participant("agent-a", "resource-1", "claim-a"), participant("agent-b", "resource-1", "claim-b")],
    );
    expect(ruling!.intervention.kind).toBe("warn");
    expect(ruling!.rule).toBe("checkpoint-unrealizable");
  });

  it("pause unrealizable but quarantine IS realizable and available — degrades past pause straight to quarantine, still satisfying severity", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause", "quarantine"])],
      ["contained"],
      [participant("agent-a", "resource-1", "claim-a"), participant("agent-b", "resource-1", "claim-b")],
    );
    expect(ruling!.intervention).toEqual({ kind: "quarantine", revokedClaims: ["claim-a", "claim-b"] });
    expect(ruling!.rule).toBe("severity-satisfied");
    expect(ruling!.escalationRecommended).toBe(false);
  });
});

describe("arbitrate — never selects a kind the paired available set did not contain (spot checks; see never-exceed-gate.test.ts for the property-based proof)", () => {
  it("available = {observe} only: never selects warn/pause/quarantine even under corrupting severity", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    const [ruling] = arbitrate([c], [availableSet(["observe"])], ["corrupting"], []);
    expect(ruling!.intervention).toEqual({ kind: "observe" });
    expect(ruling!.escalationRecommended).toBe(true);
  });

  it("available = {observe, warn, pause} with a realizable checkpoint: never selects quarantine even though corrupting severity would otherwise warrant it", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause"])],
      ["corrupting"],
      [
        participant("agent-a", "resource-1", "claim-a", { checkpoint: "cp-1" }),
        participant("agent-b", "resource-1", "claim-b", { checkpoint: "cp-1" }),
      ],
    );
    expect(ruling!.intervention.kind).toBe("pause");
    expect(ruling!.escalationRecommended).toBe(true);
    expect(ruling!.rule).toBe("gate-ceiling");
  });
});

describe("arbitrate — the human-authorized escalation beyond the gate's own ceiling", () => {
  it("corrupting severity, gate permits only warn, but a matching HumanAuthorization for THIS conflict is supplied: selects halt/forced instead of merely recommending escalation", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    const auth = humanAuthorization("human-1", c.id);
    const [ruling] = arbitrate([c], [availableSet(["observe", "warn"])], ["corrupting"], [], auth);
    expect(ruling!.intervention).toEqual({ kind: "halt", mode: "forced", authorizedBy: "human-1", conflictId: c.id });
    expect(ruling!.rule).toBe("human-forced-escalation");
    expect(ruling!.escalationRecommended).toBe(false);
  });

  it("a matching HumanAuthorization is present but severity is already satisfied by a weaker, available/realizable rung: forced is NOT used — the milestone never escalates further than severity warrants merely because authorization happens to exist", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const auth = humanAuthorization("human-1", c.id);
    const [ruling] = arbitrate(
      [c],
      [availableSet(["observe", "warn", "pause", "quarantine"])],
      ["contained"],
      [
        participant("agent-a", "resource-1", "claim-a", { checkpoint: "cp-1" }),
        participant("agent-b", "resource-1", "claim-b", { checkpoint: "cp-1" }),
      ],
      auth,
    );
    expect(ruling!.intervention.kind).toBe("pause");
    expect(ruling!.rule).toBe("severity-satisfied");
  });

  it("humanAuthorization present but its own authorizedBy/conflictId are blank — assertValidHaltForced rejects it, falling back to the gate-ceiling behavior rather than emitting an invalid Intervention", () => {
    const c = conflict("undeclared-access", "resource-1", ["agent-a"]);
    const blankAuth = { authorizedBy: "" as never, conflictId: c.id };
    const [ruling] = arbitrate([c], [availableSet(["observe", "warn"])], ["corrupting"], [], blankAuth);
    expect(ruling!.intervention.kind).toBe("warn");
    expect(ruling!.rule).toBe("gate-ceiling");
    expect(ruling!.escalationRecommended).toBe(true);
  });
});

describe("arbitrate — a ruling always cites the conflict id, the rule, and the evidence (.genesis/DONE.html's own locked spec)", () => {
  it("every ruling names its own conflict's id, a closed-vocabulary rule, and structured evidence", () => {
    const c = conflict("write-read", "resource-9", ["agent-x", "agent-y"]);
    const [ruling] = arbitrate([c], [availableSet(["observe", "warn"])], ["benign"], []);
    expect(ruling!.conflictId).toBe(c.id);
    expect(typeof ruling!.rule).toBe("string");
    expect(ruling!.evidence.severity).toBe("benign");
    expect(ruling!.evidence.availableKinds).toEqual(["observe", "warn"]);
  });
});

describe("arbitrate — batch behavior and its own input-contract enforcement", () => {
  it("rules on multiple conflicts independently, in the same order they were given", () => {
    const c1 = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const c2 = conflict("undeclared-access", "resource-2", ["agent-c"]);
    const rulings = arbitrate(
      [c1, c2],
      [availableSet(["observe", "warn"]), availableSet(["observe", "warn", "pause", "quarantine"])],
      ["benign", "corrupting"],
      [participant("agent-c", "resource-2", "claim-c")],
    );
    expect(rulings.map((r) => r.conflictId)).toEqual([c1.id, c2.id]);
    expect(rulings[0]!.intervention).toEqual({ kind: "observe" });
    expect(rulings[1]!.intervention).toEqual({ kind: "quarantine", revokedClaims: ["claim-c"] });
  });

  it("throws a clear error when conflicts/available/severities are not the same length, rather than silently mispairing or dropping a conflict", () => {
    const c = conflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    expect(() => arbitrate([c], [availableSet(["observe", "warn"]), availableSet(["observe"])], ["benign"], [])).toThrow(/same length/);
    expect(() => arbitrate([c], [availableSet(["observe", "warn"])], ["benign", "corrupting"], [])).toThrow(/same length/);
  });

  it("an empty conflicts array (with matching empty available/severities) returns an empty ruling array, never a crash", () => {
    expect(arbitrate([], [], [], [])).toEqual([]);
  });
});

describe("severity-ladder — the ranking arbitrate.ts's own selection logic depends on", () => {
  it("orders the rungs weakest to strongest, exactly as documented", () => {
    expect(rungRank("observe")).toBeLessThan(rungRank("warn"));
    expect(rungRank("warn")).toBeLessThan(rungRank("pause"));
    expect(rungRank("pause")).toBeLessThan(rungRank("halt-checkpointed"));
    expect(rungRank("halt-checkpointed")).toBeLessThan(rungRank("quarantine"));
    expect(rungRank("quarantine")).toBeLessThan(rungRank("halt-forced"));
  });
});
