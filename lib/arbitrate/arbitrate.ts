import type { DetectedConflict } from "../conflict/detected-conflict.js";
import type { AvailableInterventionSet, AvailableInterventionKind } from "../gate/available-interventions.js";
import type { ConflictSeverity } from "../contracts/conflict-severity.js";
import type { ConflictId, CheckpointId, ResourceClaimId } from "../contracts/ids.js";
import type { Intervention, HaltForced } from "../contracts/intervention.js";
import { assertValidHaltForced } from "../contracts/intervention.js";
import { isNonEmptyArray, type NonEmptyArray } from "../contracts/non-empty-array.js";
import type { ArbitrationParticipant } from "./arbitration-participant.js";
import type { HumanAuthorization } from "./human-authorization.js";
import { matchesConflict } from "./human-authorization.js";
import { ALL_ARBITRATION_RUNGS, rungRank, SEVERITY_MINIMUM_RUNG, type ArbitrationRung } from "./severity-ladder.js";
import type { ArbitrationRule, InterventionRuling } from "./intervention-ruling.js";

/**
 * `arbitrate` — plan §4 M5's own scope, restated with this milestone's own
 * signature (see `.genesis/decisions/0005-arbitration.md` for the decision
 * record and the argument for every departure from the plan's literal
 * text below): "the decision layer, selecting per conflict the strongest
 * intervention both permitted by M4's gate and warranted by severity,
 * always citing the conflict id, the rule, and the evidence."
 *
 * SIGNATURE, AND HOW IT DIFFERS FROM `.genesis/PLAN.md` §4's LITERAL TEXT
 * (`arbitrate(conflicts: Conflict[], available: AvailableInterventionSet[],
 * severity: ConflictSeverity, humanAuthorization?: HumanAuthorization):
 * InterventionRuling[]`) — THREE DEPARTURES, EACH ARGUED IN FULL IN
 * `.genesis/decisions/0005-arbitration.md`, NOT SILENTLY MADE:
 *
 *   1. `conflicts: readonly DetectedConflict[]`, not `Conflict[]` — the
 *      identical departure M3 already made (`lib/conflict/detected-
 *      conflict.ts`) and `.genesis/decisions/0004-gate.md` Decision 3
 *      itself names as this milestone's own precedent to follow: a bare
 *      3-value enum has no `id` field for a ruling to cite, and
 *      `.genesis/DONE.html`'s own locked spec requires one.
 *   2. `severities: readonly ConflictSeverity[]`, not a single, batch-wide
 *      `severity: ConflictSeverity` — a genuine plan defect found while
 *      building this milestone, not a guess: `lib/contracts/conflict-
 *      severity.ts`'s own header states severity is "computed from the
 *      conflicting resource's declared blast radius and the conflict
 *      kind," which is a PER-CONFLICT fact (different conflicts, even in
 *      the same batch, ordinarily have different kinds and resources) —
 *      one shared severity value for an entire `conflicts` array cannot
 *      express that. Index-paired with `conflicts`, the same convention
 *      the plan's own literal signature already uses for
 *      `available`.
 *   3. `participants: readonly ArbitrationParticipant[]` — a new
 *      parameter the plan's own literal text has NO slot for at all
 *      (`.genesis/decisions/0004-gate.md` Decision 3, verbatim: "the
 *      plan's own literal M5 signature ... has no claims parameter at
 *      all"). Closes the `ResourceClaimId`-identifies-a-claim half of
 *      `.genesis/decisions/0001-contracts.md` Decision 3's named gap
 *      (`quarantine`'s `revokedClaims`) AND, found while actually building
 *      this function (not named anywhere in the plan or either prior
 *      ADR), the identical gap for `CheckpointId` (`pause`/`halt`/
 *      `checkpointed` both require one, and nothing before this milestone
 *      ever carried one downstream of `lib/gate/**`, which never
 *      constructs an `Intervention` value at all). One parameter closes
 *      both, because both are "which concrete id does this conflict's
 *      participant carry" questions of the identical shape.
 *
 * WHAT DID NOT CHANGE: `conflicts`/`available`/`severities` are still
 * INDEX-PAIRED arrays (`available[i]`/`severities[i]` describe
 * `conflicts[i]`), matching the plan's own literal convention for
 * `available` rather than inventing a fourth, differently-shaped batching
 * style — see `.genesis/decisions/0005-arbitration.md` Decision 2 for why
 * a single combined per-conflict record type was considered and rejected
 * in favor of this narrower extension. `humanAuthorization` stays a single,
 * optional value — plan §4 M5's own literal text already scopes it that
 * way, and this project's own thesis has no scenario needing more than one
 * live human sign-off in flight at once for this milestone to build
 * against.
 *
 * PRECONDITION, ENFORCED BY THROWING, NOT BY GUESSING A PAIRING: `conflicts`,
 * `available`, and `severities` must be the same length — a caller that
 * hands three mismatched arrays has violated the index-pairing contract
 * this signature depends on, and silently truncating to the shortest one
 * would silently DROP a conflict from being ruled on at all, the same
 * "never silently favor whoever's array is shorter/longer" refusal this
 * codebase already applies elsewhere (`.genesis/decisions/0003-detection.md`
 * Decision 4, order-independence). This is a caller-contract violation,
 * not adversarial runtime input the plan asks this milestone to defend
 * against (unlike M3's named hostile-claims-array refusal — no equivalent
 * refusal is named anywhere in plan §4 M5), so this milestone fails loudly
 * with a plain `Error` rather than inventing an unrequested discriminated
 * result type.
 *
 * THE NEVER-EXCEED-THE-GATE PROPERTY, ENFORCED STRUCTURALLY: every
 * candidate this function ever considers for a given conflict, OTHER than
 * `halt`/`forced`, is drawn from `ALL_ARBITRATION_RUNGS.filter(isGateRung)`
 * intersected with that conflict's own paired `available` set
 * (`gateRungsOf` below) — there is no code path in this file that
 * considers, realizes, or selects a non-forced rung the caller's own
 * `available` set did not contain. `halt`/`forced` is the one, singular,
 * clearly-marked exception (`realizeHaltForced`), gated on its own,
 * separate, per-conflict-matched `HumanAuthorization` condition — never on
 * `available` at all, because the gate structurally cannot speak to that
 * mode (`.genesis/decisions/0004-gate.md` Decision 1). See
 * `__tests__/never-exceed-gate.test.ts` for the property-based proof over
 * generated inputs, and this file's own `ruleOneConflict` for where both
 * paths are visibly separate branches, never merged into one.
 */
export function arbitrate(
  conflicts: readonly DetectedConflict[],
  available: readonly AvailableInterventionSet[],
  severities: readonly ConflictSeverity[],
  participants: readonly ArbitrationParticipant[],
  humanAuthorization?: HumanAuthorization,
): readonly InterventionRuling[] {
  if (conflicts.length !== available.length || conflicts.length !== severities.length) {
    throw new Error(
      `arbitrate: conflicts (${conflicts.length}), available (${available.length}), and severities ` +
        `(${severities.length}) must be the same length — they are index-paired, one entry per conflict.`,
    );
  }

  return conflicts.map((conflict, index) =>
    ruleOneConflict({
      conflict,
      // `noUncheckedIndexedAccess` already proves these reads are safe:
      // `index` never exceeds `conflicts.length - 1`, and the length-equality
      // check above already confirmed `available`/`severities` are at least
      // that long — but the compiler cannot see that invariant across two
      // statements, so a `!` here would be an unchecked assertion.
      // `.at(index)` plus an explicit runtime check keeps this honest.
      available: requireIndex(available, index, "available"),
      severity: requireIndex(severities, index, "severities"),
      participants,
      humanAuthorization,
    }),
  );
}

function requireIndex<T>(values: readonly T[], index: number, name: string): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Unreachable: ${name}[${index}] was undefined despite the length check in arbitrate().`);
  }
  return value;
}

interface RealizationContext {
  readonly conflict: DetectedConflict;
  readonly checkpointId: CheckpointId | null;
  readonly claimIds: NonEmptyArray<ResourceClaimId> | null;
  readonly authorization: HumanAuthorization | undefined;
}

interface Realized {
  readonly intervention: Intervention;
}

/** A conflict's participants are exactly the `ArbitrationParticipant`s naming both this conflict's `resourceId` AND one of its `agentIds` — the identical `(resourceId, agentId)` correlation `lib/conflict/detect-conflicts.ts`'s own (private, unimported) `claimedPairKey` already uses for the identical question, re-derived independently here rather than reached into. */
function relevantParticipants(
  conflict: DetectedConflict,
  participants: readonly ArbitrationParticipant[],
): readonly ArbitrationParticipant[] {
  const agentIdStrings = new Set(conflict.agentIds.map((id) => String(id)));
  return participants.filter(
    (p) => String(p.resourceId) === String(conflict.resourceId) && agentIdStrings.has(String(p.agentId)),
  );
}

/**
 * The single `CheckpointId` `pause`/`halt`/`checkpointed` would cite for
 * this conflict, or `null` if none can be honestly resolved. FAILS CLOSED
 * ON BOTH AXES THIS FUNCTION CANNOT RESOLVE, NEVER GUESSES: zero
 * participants supplying a `checkpointId` at all (`null` — nothing to
 * cite), and MORE THAN ONE DISTINCT `checkpointId` among this conflict's
 * relevant participants (also `null` — picking one of several
 * disagreeing agents' checkpoints arbitrarily is exactly the "never picks
 * one arbitrarily" refusal `.genesis/decisions/0003-detection.md` Decision
 * 4 already states for a different comparison, re-derived here for this
 * one). This is a real, disclosed limit for a multi-agent conflict where
 * agents legitimately disagree — see `.genesis/decisions/
 * 0005-arbitration.md` for why no aggregation policy (earliest, most
 * agents agree, etc.) is invented to resolve it: no such policy is named
 * anywhere in the plan, and this milestone's own `checkpoint-unrealizable`
 * degradation already gives a caller a truthful, typed answer instead
 * ("could not be realized"), never a fabricated pick.
 */
function uniqueCheckpointId(relevant: readonly ArbitrationParticipant[]): CheckpointId | null {
  const declared = relevant
    .map((p) => p.checkpointId)
    .filter((id): id is CheckpointId => id !== undefined);
  if (declared.length === 0) return null;
  const distinct = new Set(declared.map((id) => String(id)));
  if (distinct.size !== 1) return null;
  return declared[0]!;
}

/** The claims `quarantine` would revoke for this conflict, deduplicated and sorted for determinism (the identical `Set` + sort discipline `lib/conflict/detected-conflict.ts`'s `deriveConflictId` already uses for the same reason), or `null` if this conflict has no participant carrying a claim id at all — the exact "gate says yes, nothing to revoke" gap plan §2's own `quarantine` refusal names. */
function claimIdsOf(relevant: readonly ArbitrationParticipant[]): NonEmptyArray<ResourceClaimId> | null {
  const sorted = relevant.slice().sort((a, b) => (String(a.claimId) < String(b.claimId) ? -1 : String(a.claimId) > String(b.claimId) ? 1 : 0));
  const seen = new Set<string>();
  const ids: ResourceClaimId[] = [];
  for (const p of sorted) {
    const key = String(p.claimId);
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(p.claimId);
    }
  }
  return isNonEmptyArray(ids) ? ids : null;
}

function realizeObserve(): Realized {
  return { intervention: { kind: "observe" } };
}

/** `message` is deliberately a plain, factual description of WHICH conflict this is — never a claim about whether this response is adequate (that judgment lives entirely in this ruling's own `rule`/`escalationRecommended` fields, as structured data a caller can act on, not prose a caller would have to parse). */
function realizeWarn(conflict: DetectedConflict): Realized {
  const agents = conflict.agentIds.map((id) => String(id)).join(", ");
  return {
    intervention: {
      kind: "warn",
      message: `Conflict ${String(conflict.id)} (${conflict.kind}) on resource ${String(conflict.resourceId)}, agents: ${agents}.`,
    },
  };
}

function realizePause(checkpointId: CheckpointId | null): Realized | null {
  if (checkpointId === null) return null;
  return { intervention: { kind: "pause", checkpointId } };
}

function realizeHaltCheckpointed(checkpointId: CheckpointId | null): Realized | null {
  if (checkpointId === null) return null;
  return { intervention: { kind: "halt", mode: "checkpointed", checkpointId } };
}

function realizeQuarantine(claimIds: NonEmptyArray<ResourceClaimId> | null): Realized | null {
  if (claimIds === null) return null;
  return { intervention: { kind: "quarantine", revokedClaims: claimIds } };
}

/**
 * THE ONLY PLACE IN THIS MILESTONE THAT CONSTRUCTS A `halt`/`forced`
 * `Intervention` LITERAL. Both `authorizedBy` and `conflictId` are read
 * directly off `authorization` — this function's own parameter — via a
 * plain property access; neither is ever a fresh string literal, a
 * default, or derived any other way. This is the concrete code this
 * milestone's own obligation (`.genesis/decisions/0001-contracts.md`
 * Decision 2, restated in `lib/contracts/intervention.ts`'s header) asks
 * for: "the only way `lib/`'s own code may ever produce one is by copying
 * `authorizedBy`/`conflictId` verbatim from a value handed in by that
 * code's own caller." See `__tests__/no-self-authorized-force.test.ts`
 * for the best-effort structural scan proving this shape, and this
 * function's own caller (`realizeHaltForced`) for the runtime
 * cross-check (`assertValidHaltForced`) layered on top of it.
 */
function buildForced(authorization: HumanAuthorization): HaltForced {
  return {
    kind: "halt",
    mode: "forced",
    authorizedBy: authorization.authorizedBy,
    conflictId: authorization.conflictId,
  };
}

/**
 * `halt`/`forced`'s own realizer — deliberately NOT keyed on `available`
 * at all (see this file's own header for why that is the correct,
 * structural boundary, not an oversight): realizable iff
 * `humanAuthorization` matches THIS conflict's own id
 * (`matchesConflict`, `human-authorization.ts` — the per-conflict check
 * plan §4 M5 names verbatim, and the mechanism
 * `__tests__/human-authorization.test.ts`'s "A cannot license B" case
 * proves directly), AND the constructed value independently passes
 * `lib/contracts/intervention.ts`'s own frozen `assertValidHaltForced` —
 * layered defense-in-depth this milestone did not have to invent, reusing
 * exactly the runtime guard M1's own plan section asks every later
 * milestone constructing this variant to run.
 */
function realizeHaltForced(conflictId: ConflictId, authorization: HumanAuthorization | undefined): Realized | null {
  if (!matchesConflict(authorization, conflictId)) return null;
  const forced = buildForced(authorization);
  const validity = assertValidHaltForced(forced);
  if (!validity.ok) return null;
  return { intervention: forced };
}

function assertNeverRung(value: never): never {
  throw new Error(`Unreachable: unhandled ArbitrationRung ${String(value)}`);
}

function realize(rung: ArbitrationRung, ctx: RealizationContext): Realized | null {
  switch (rung) {
    case "observe":
      return realizeObserve();
    case "warn":
      return realizeWarn(ctx.conflict);
    case "pause":
      return realizePause(ctx.checkpointId);
    case "halt-checkpointed":
      return realizeHaltCheckpointed(ctx.checkpointId);
    case "quarantine":
      return realizeQuarantine(ctx.claimIds);
    case "halt-forced":
      return realizeHaltForced(ctx.conflict.id, ctx.authorization);
    default:
      return assertNeverRung(rung);
  }
}

/** `rung !== "halt-forced"` as a type guard — the one predicate this file uses everywhere it needs "every rung the gate can structurally speak to," narrowing `ArbitrationRung` down to the real `AvailableInterventionKind` it is a superset of (`severity-ladder.ts`'s own header). */
function isGateRung(rung: ArbitrationRung): rung is AvailableInterventionKind {
  return rung !== "halt-forced";
}

interface ArbitrateOneInput {
  readonly conflict: DetectedConflict;
  readonly available: AvailableInterventionSet;
  readonly severity: ConflictSeverity;
  readonly participants: readonly ArbitrationParticipant[];
  readonly humanAuthorization: HumanAuthorization | undefined;
}

function determineDegradedRule(gateRungsAscending: readonly ArbitrationRung[], selected: ArbitrationRung): ArbitrationRule {
  const strongestAvailable = gateRungsAscending[gateRungsAscending.length - 1];
  if (strongestAvailable === undefined || strongestAvailable === selected) {
    return "gate-ceiling";
  }
  // Something ranked ABOVE `selected` was present in `available` but not
  // realizable (else it would have been chosen instead — candidates are
  // scanned strongest-first for the fallback). Name the rule after the
  // STRONGEST such skipped rung, the most informative single fact for a
  // reviewer to see.
  const skippedAboveSelected = gateRungsAscending.filter((r) => rungRank(r) > rungRank(selected));
  const topSkipped = skippedAboveSelected[skippedAboveSelected.length - 1];
  if (topSkipped === "quarantine") return "quarantine-unrealizable";
  if (topSkipped === "pause" || topSkipped === "halt-checkpointed") return "checkpoint-unrealizable";
  return "gate-ceiling";
}

/**
 * Rules on exactly one conflict. See this file's own header for the
 * never-exceed-the-gate property this function's own structure enforces,
 * and `.genesis/decisions/0005-arbitration.md` for the full selection
 * algorithm's derivation. Summarized:
 *
 *   1. Compute this conflict's relevant participants, and from them the
 *      one realizable `checkpointId` (or `null`) and `claimIds` (or
 *      `null`) — see `uniqueCheckpointId`/`claimIdsOf`.
 *   2. Build the ordered (weakest-first) list of this conflict's
 *      `available`-and-REALIZABLE non-forced rungs.
 *   3. Among those, pick the WEAKEST one that meets or exceeds
 *      `SEVERITY_MINIMUM_RUNG[severity]` — proportionality: never select
 *      something stronger than severity warrants merely because a
 *      stronger option happens to be available too.
 *   4. If none meets the floor: if a per-conflict-matched, well-formed
 *      `HumanAuthorization` is present, select `halt`/`forced`. Otherwise,
 *      fall back to the STRONGEST available-and-realizable rung (the best
 *      this conflict's own evidence supports) and set
 *      `escalationRecommended: true` — plan §4 M5's own refusal, verbatim:
 *      "it must instead return the strongest available option **and** a
 *      distinct `escalationRecommended: true` flag, never silently
 *      pretend the weaker option was sufficient."
 */
function ruleOneConflict(input: ArbitrateOneInput): InterventionRuling {
  const { conflict, available, severity, participants, humanAuthorization } = input;
  const relevant = relevantParticipants(conflict, participants);
  const ctx: RealizationContext = {
    conflict,
    checkpointId: uniqueCheckpointId(relevant),
    claimIds: claimIdsOf(relevant),
    authorization: humanAuthorization,
  };

  const gateRungsAscending = ALL_ARBITRATION_RUNGS.filter(isGateRung).filter((rung) => available.has(rung));
  const requiredMinimumRung = SEVERITY_MINIMUM_RUNG[severity];
  const requiredRank = rungRank(requiredMinimumRung);
  const humanAuthorizationMatched = matchesConflict(humanAuthorization, conflict.id);

  const realizableAscending: { readonly rung: ArbitrationRung; readonly realized: Realized }[] = [];
  for (const rung of gateRungsAscending) {
    const realized = realize(rung, ctx);
    if (realized !== null) realizableAscending.push({ rung, realized });
  }

  const meetingFloor = realizableAscending.filter((c) => rungRank(c.rung) >= requiredRank);
  if (meetingFloor.length > 0) {
    const chosen = meetingFloor[0]!; // weakest among those meeting the floor — `realizableAscending` is already weakest-first.
    return {
      conflictId: conflict.id,
      intervention: chosen.realized.intervention,
      rule: "severity-satisfied",
      escalationRecommended: false,
      evidence: {
        severity,
        availableKinds: gateRungsAscending,
        requiredMinimumRung,
        selectedRung: chosen.rung,
        humanAuthorizationMatched,
      },
    };
  }

  if (humanAuthorizationMatched) {
    const forced = realize("halt-forced", ctx);
    if (forced !== null) {
      return {
        conflictId: conflict.id,
        intervention: forced.intervention,
        rule: "human-forced-escalation",
        escalationRecommended: false,
        evidence: {
          severity,
          availableKinds: gateRungsAscending,
          requiredMinimumRung,
          selectedRung: "halt-forced",
          humanAuthorizationMatched,
        },
      };
    }
  }

  // DISCLOSED, NAMED EXCEPTION to "never select a rung `available` did not
  // contain": if `available` is so malformed it contains not even
  // `"observe"` (the real `lib/gate` `availableInterventions` always
  // includes it unconditionally — this can only happen if a caller hands
  // this function something other than a genuine `AvailableInterventionSet`
  // from that function), this milestone still owes exactly one ruling per
  // conflict and picks `observe` anyway, rather than returning nothing or
  // throwing: `observe` "carries no data" and "structurally cannot justify
  // or record an action it didn't take" (`intervention.ts`'s own header),
  // so selecting it costs nothing even when technically ungranted. See
  // `.genesis/decisions/0005-arbitration.md` for this disclosed limit
  // pinned by a real test, not left for a future verifier to rediscover.
  const fallback = realizableAscending[realizableAscending.length - 1] ?? { rung: "observe" as const, realized: realizeObserve() };
  const rule = determineDegradedRule(gateRungsAscending, fallback.rung);
  return {
    conflictId: conflict.id,
    intervention: fallback.realized.intervention,
    rule,
    escalationRecommended: true,
    evidence: {
      severity,
      availableKinds: gateRungsAscending,
      requiredMinimumRung,
      selectedRung: fallback.rung,
      humanAuthorizationMatched,
    },
  };
}
