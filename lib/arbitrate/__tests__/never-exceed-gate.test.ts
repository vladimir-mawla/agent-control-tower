import { describe, expect, it } from "vitest";
import { conflictId } from "../../contracts/ids.js";
import { arbitrate } from "../arbitrate.js";
import type { AvailableInterventionSet } from "../../gate/available-interventions.js";
import type { ArbitrationParticipant } from "../arbitration-participant.js";
import type { DetectedConflict } from "../../conflict/detected-conflict.js";
import type { ConflictSeverity } from "../../contracts/conflict-severity.js";
import { conflict, humanAuthorization, mulberry32, participant, pick, randomAgentIds, randomAvailableSet } from "./fixtures.js";

/**
 * THE MILESTONE'S CENTRAL PROPERTY, PROVEN OVER GENERATED INPUTS, NOT A
 * HANDFUL OF FIXTURES: `arbitrate` never selects, for a given conflict, an
 * `AvailableInterventionKind` its own paired `available` set did not
 * contain — with exactly one, structurally separate, clearly-marked
 * exception (`halt`/`forced`, gated on a per-conflict-matched
 * `HumanAuthorization`, never on `available` at all — see `arbitrate.ts`'s
 * own header for why that is the correct boundary, not a hole in this
 * property). 300 randomly generated scenarios, each with 1–4 conflicts, a
 * randomly sized available set per conflict (always including the real
 * gate's own unconditional `observe`/`warn` baseline — this milestone's
 * own documented precondition on `available`, see `arbitrate.ts`'s
 * header), random participants (sometimes complete, sometimes missing
 * claims/checkpoints, sometimes disagreeing on checkpoints — to actually
 * exercise the realizability-degradation paths, not just the ordinary
 * ones), and a randomly-placed (or absent) `HumanAuthorization`.
 */
const SEVERITIES: readonly ConflictSeverity[] = ["benign", "contained", "corrupting"];
const AGENT_POOL = ["agent-a", "agent-b", "agent-c", "agent-d"];
const RESOURCE_POOL = ["resource-1", "resource-2", "resource-3"];
const KIND_POOL = ["write-write", "write-read", "undeclared-access"] as const;

interface Scenario {
  readonly conflicts: readonly DetectedConflict[];
  readonly available: readonly AvailableInterventionSet[];
  readonly severities: readonly ConflictSeverity[];
  readonly participants: readonly ArbitrationParticipant[];
  readonly humanAuthorization: ReturnType<typeof humanAuthorization> | undefined;
}

function buildScenario(rand: () => number): Scenario {
  const conflictCount = 1 + Math.floor(rand() * 4);
  const conflicts: DetectedConflict[] = [];
  const available: AvailableInterventionSet[] = [];
  const severities: ConflictSeverity[] = [];
  const participants: ArbitrationParticipant[] = [];

  for (let i = 0; i < conflictCount; i++) {
    const kind = pick(rand, KIND_POOL);
    const resource = pick(rand, RESOURCE_POOL);
    const agents = randomAgentIds(rand, AGENT_POOL);
    const c = conflict(kind, resource, agents.map((a) => String(a)), `conflict-${i}-${resource}-${agents.join("+")}`);
    conflicts.push(c);
    available.push(randomAvailableSet(rand));
    severities.push(pick(rand, SEVERITIES));

    for (const agent of agents) {
      // Not every agent necessarily has a tracked claim/checkpoint in this
      // milestone's own data — sometimes deliberately omitted, to exercise
      // the realizability-degradation paths.
      if (rand() < 0.85) {
        const hasCheckpoint = rand() < 0.6;
        // Occasionally hand out a DIFFERENT checkpoint id per agent on the
        // same conflict, to exercise the "participants disagree" fail-closed
        // path deliberately, not just the "everyone agrees" happy path.
        const checkpointSuffix = rand() < 0.75 ? "shared" : `${String(agent)}-own`;
        participants.push(
          participant(String(agent), resource, `claim-${i}-${String(agent)}`, hasCheckpoint ? { checkpoint: `cp-${i}-${checkpointSuffix}` } : {}),
        );
      }
    }
  }

  let auth: ReturnType<typeof humanAuthorization> | undefined;
  const authRoll = rand();
  if (authRoll < 0.5) {
    auth = undefined;
  } else if (authRoll < 0.85) {
    const target = conflicts[Math.floor(rand() * conflicts.length)]!;
    auth = humanAuthorization("human-operator", target.id);
  } else {
    // An authorization for a conflict NOT in this batch at all — must never
    // license anything for any conflict that IS in the batch.
    auth = humanAuthorization("human-operator", conflictId(String(conflicts[0]!.id) + "-not-in-batch"));
  }

  return { conflicts, available, severities, participants, humanAuthorization: auth };
}

describe("never-exceed-the-gate — property-based proof over 300 generated scenarios", () => {
  it("every ruling's selected rung is either present in its own conflict's paired available set, or is the separately-gated, per-conflict-matched halt/forced escalation", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed);
      const scenario = buildScenario(rand);
      const rulings = arbitrate(scenario.conflicts, scenario.available, scenario.severities, scenario.participants, scenario.humanAuthorization);

      expect(rulings.length).toBe(scenario.conflicts.length);

      rulings.forEach((ruling, index) => {
        const pairedAvailable = scenario.available[index]!;
        const pairedConflict = scenario.conflicts[index]!;
        const selected = ruling.evidence.selectedRung;

        if (selected === "halt-forced") {
          // THE ONE NAMED EXCEPTION: forced is legitimate here iff, and
          // only iff, this ruling's OWN conflict is the one the supplied
          // authorization actually names.
          expect(ruling.intervention).toEqual({
            kind: "halt",
            mode: "forced",
            authorizedBy: scenario.humanAuthorization?.authorizedBy,
            conflictId: pairedConflict.id,
          });
          expect(scenario.humanAuthorization?.conflictId).toBe(pairedConflict.id);
          expect(ruling.evidence.humanAuthorizationMatched).toBe(true);
          expect(ruling.rule).toBe("human-forced-escalation");
        } else {
          // EVERY OTHER RUNG: must have been present in THIS conflict's own
          // paired available set — never borrowed from another conflict's
          // set, never invented. (`observe` is the one further-disclosed
          // fallback for a malformed, empty `available` set — never
          // exercised here, since `randomAvailableSet` always includes it —
          // confirmed explicitly by the assertion below.)
          expect(pairedAvailable.has(selected)).toBe(true);
        }

        // Structural fact, independent of the above: `ruling.conflictId`
        // always names the conflict this ruling is actually paired with by
        // POSITION, never a different one from the same batch.
        expect(ruling.conflictId).toBe(pairedConflict.id);
      });
    }
  });

  it("an authorization for a conflict outside the batch entirely never licenses forced for any conflict inside it", () => {
    for (let seed = 1000; seed <= 1050; seed++) {
      const rand = mulberry32(seed);
      const scenario = buildScenario(rand);
      if (!scenario.humanAuthorization) continue;
      const authTargetsSomethingInBatch = scenario.conflicts.some((c) => c.id === scenario.humanAuthorization?.conflictId);
      if (authTargetsSomethingInBatch) continue;

      const rulings = arbitrate(scenario.conflicts, scenario.available, scenario.severities, scenario.participants, scenario.humanAuthorization);
      for (const ruling of rulings) {
        expect(ruling.intervention.kind === "halt" && (ruling.intervention as { mode?: string }).mode === "forced").toBe(false);
      }
    }
  });
});

/**
 * L4 VERIFY REPORTED THAT THIS SWEEP, AS ORIGINALLY WRITTEN, NEVER
 * EXPLORED THE EXACT AXIS THAT TURNED OUT EXPLOITABLE: every generated
 * conflict's own id is derived from `kind-resource-agents`
 * (`buildScenario` above), which makes two conflicts in the same
 * scenario landing on an identical id astronomically unlikely — so 300
 * passing scenarios were never evidence that a COLLIDING id is handled
 * correctly, only that one never happened to occur. "A generator that
 * cannot produce the failure is not evidence of its absence" — the
 * coordinator's own words, kept verbatim because restating them would
 * risk softening the point. This describe block generates the collision
 * DELIBERATELY, on every iteration, rather than hoping for one.
 */
function buildCollidingScenario(rand: () => number): Scenario {
  const base = buildScenario(rand);
  // Guarantee at least 2 conflicts, then force the second one's `id` to
  // equal the first's, while leaving its `kind`/`resourceId`/`agentIds`
  // exactly as generated — a genuinely different collision, sharing only
  // the id string, the precise shape of the reported bypass.
  const first = base.conflicts[0]!;
  const second = base.conflicts[1] ?? conflict("undeclared-access", "resource-99", ["agent-z"], "placeholder-second");
  const collidingSecond: DetectedConflict = { ...second, id: first.id };
  const conflicts = [first, collidingSecond, ...base.conflicts.slice(2)];
  const available = base.available.length >= conflicts.length ? base.available : [...base.available, ...base.available.slice(0, conflicts.length - base.available.length)];
  const severities = base.severities.length >= conflicts.length ? base.severities : [...base.severities, ...base.severities.slice(0, conflicts.length - base.severities.length)];
  return { ...base, conflicts, available: available.slice(0, conflicts.length), severities: severities.slice(0, conflicts.length) };
}

describe("the duplicate-conflict-id axis — deliberately explored, not left to chance", () => {
  it("100 deliberately-colliding generated scenarios are ALL refused before any ruling is produced, naming the colliding id", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rand = mulberry32(seed);
      const scenario = buildCollidingScenario(rand);
      const collidingId = String(scenario.conflicts[0]!.id);
      expect(() => arbitrate(scenario.conflicts, scenario.available, scenario.severities, scenario.participants, scenario.humanAuthorization)).toThrow(
        new RegExp(`duplicate conflict id.*${collidingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
      );
    }
  });

  it("sanity: the forced-collision generator really does produce two conflicts with the same id but different kind/resourceId/agentIds (not a vacuous 'always throws anyway' generator)", () => {
    const rand = mulberry32(1);
    const scenario = buildCollidingScenario(rand);
    const [c1, c2] = scenario.conflicts;
    expect(c1!.id).toBe(c2!.id);
    const genuinelyDifferent = c1!.kind !== c2!.kind || String(c1!.resourceId) !== String(c2!.resourceId) || String(c1!.agentIds) !== String(c2!.agentIds);
    expect(genuinelyDifferent).toBe(true);
  });
});

describe("sanity: the generator actually exercises every rung and every rule at least once across the sweep (a passing property test isn't vacuous)", () => {
  it("touches every ArbitrationRule and every non-forced rung at least once, and forced at least once", () => {
    const seenRules = new Set<string>();
    const seenRungs = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed);
      const scenario = buildScenario(rand);
      const rulings = arbitrate(scenario.conflicts, scenario.available, scenario.severities, scenario.participants, scenario.humanAuthorization);
      for (const ruling of rulings) {
        seenRules.add(ruling.rule);
        seenRungs.add(ruling.evidence.selectedRung);
      }
    }
    expect(seenRules).toEqual(new Set(["severity-satisfied", "gate-ceiling", "checkpoint-unrealizable", "quarantine-unrealizable", "human-forced-escalation"]));
    expect(seenRungs).toEqual(new Set(["observe", "warn", "pause", "halt-checkpointed", "quarantine", "halt-forced"]));
  });
});
