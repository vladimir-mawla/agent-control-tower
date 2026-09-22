import type { AgentId } from "../contracts/ids.js";
import type { ResourceClaim } from "../contracts/resource-claim.js";
import type { CheckpointDeclaration } from "../contracts/checkpoint-declaration.js";
import type { Timestamp } from "../contracts/timestamp.js";
import type { Intervention } from "../contracts/intervention.js";
import { isCheckpointFresh } from "./clock.js";

/**
 * `AvailableInterventionKind` — the closed vocabulary this milestone's
 * gate is allowed to hand back, and the type this milestone's own
 * central design commitment rests on.
 *
 * DERIVATION, AND WHY IT IS NOT A BARE, HAND-WRITTEN LIST OF FIVE
 * STRINGS: `Exclude<Intervention["kind"], "halt">` mechanically ties four
 * of five members (`observe` | `warn` | `pause` | `quarantine`) to
 * `lib/contracts/intervention.ts`'s own frozen union, so this file cannot
 * silently drift out of sync with it (a typo here would be a type error
 * against the real `Intervention["kind"]`, not a second, independent
 * spelling to keep in sync by hand). `"halt"` itself is REMOVED from that
 * projection entirely — `Intervention["kind"]` alone cannot distinguish
 * which of `Intervention`'s two halt modes is meant, and `.genesis/
 * PLAN.md` §4 M4's own scope line requires exactly that distinction
 * ("`Set<Intervention["kind"]>` ... with halt's two modes distinguished")
 * — so this file adds back exactly ONE new, hand-written literal,
 * `"halt-checkpointed"`, naming only the checkpoint-anchored halt mode.
 *
 * THIS IS THE ACTUAL MECHANISM BEHIND THIS MILESTONE'S CENTRAL
 * COMMITMENT, STATED PLAINLY: there is no third halt-shaped member here.
 * The other halt mode `Intervention` defines — the one requiring a
 * per-conflict human authorization, named at length in `intervention.ts`'s
 * own header and in this project's plan as the single highest-risk
 * outcome in the whole system — has no string literal anywhere in this
 * union, no field on any of this union's five members that could carry
 * one, and no code path in `availableInterventions` below that could ever
 * produce one even via a typo, because there is nothing here spelled
 * closely enough to typo INTO. This is a property of the type declaration
 * itself, checked by `@ts-expect-error` in this milestone's own test
 * suite (assigning that mode's own name to this type must not compile) —
 * this type-level exclusion, plus this function's own signature carrying
 * no `Intervention`-typed parameter at all, is what this project's actual
 * safety claim rests on. Two source-scan tests reconfirm narrower,
 * differently-scoped facts on top of that: `__tests__/architecture.
 * test.ts` fails the build if that mode's own name appears literally,
 * as text, anywhere in this package's non-test source; `__tests__/
 * type-leak.test.ts` independently fails the build if any type
 * annotation's own RESOLVED type includes that mode's literal even when
 * reached by computation (`Extract`, an indexed access, a conditional
 * type) with no matching text anywhere — a distinct, decidable question
 * neither `architecture.test.ts` nor a plain grep can answer. See
 * `.genesis/decisions/0004-gate.md` Decision 6 for why this milestone
 * needed both, after independent review found a real gap between them.
 *
 * WHAT THIS MEANS FOR THE OBLIGATION THIS MILESTONE INHERITS FROM M1:
 * `.genesis/decisions/0001-contracts.md` Decision 2 states the project's
 * real safety property as "no module under `lib/` ever mints a `HumanId`,
 * or assembles [that halt mode's] `Intervention` from scratch." This
 * module satisfies that trivially and completely, not approximately:
 * `availableInterventions` below never constructs an `Intervention`
 * value at all, of any kind — it returns a `Set` of plain string labels.
 * There is no object literal anywhere in this file with a `kind` field to
 * populate, so there is no `HumanId` field to fill in, no matter how the
 * gate's own logic is later modified. The gate's own charter (this
 * milestone's task) states this directly: "It does not choose one — that
 * is M5's arbitration. It bounds the set."
 */
export type AvailableInterventionKind = Exclude<Intervention["kind"], "halt"> | "halt-checkpointed";

/** Every legal `AvailableInterventionKind`, for tests that need to enumerate the closed set — same convention `lib/contracts/corroboration.ts`/`conflict.ts`/`conflict-severity.ts` already use for their own closed enums. Not consumed by any production code in this milestone. */
export const ALL_AVAILABLE_INTERVENTION_KINDS: readonly AvailableInterventionKind[] = [
  "observe",
  "warn",
  "pause",
  "halt-checkpointed",
  "quarantine",
];

/** What `.genesis/PLAN.md` §3's own pipeline diagram calls the value this stage produces, per agent, per claim: "`AvailableInterventionSet` ... (M4: what's structurally permitted, given `Corroboration` + checkpoint freshness)." A plain `ReadonlySet`, not a wrapper object — this milestone's own scope line asks for a bare `Set`, never a discriminated result the way `lib/conflict/detection-result.ts`'s `DetectionResult` is: nothing in plan §4 M4's own "what it refuses" list asks this function to report that it could not run at all (unlike M3's hostile-input refusal), so no such slot is invented here without a named requirement to justify it. */
export type AvailableInterventionSet = ReadonlySet<AvailableInterventionKind>;

/**
 * `availableInterventions` — plan §4 M4's own scope, restated with this
 * milestone's own return type (see `AvailableInterventionKind`'s header
 * above for why that return type differs from the plan's literal
 * `Set<Intervention["kind"]>` text, and `.genesis/decisions/0004-gate.md`
 * for the decision record): "computed from `Corroboration` and
 * checkpoint freshness alone, independent of severity, which is M5's
 * job." This function never chooses an intervention — it only bounds
 * which KINDS are structurally permitted for this one `(agent, claim,
 * checkpoint)` triple, at this one instant.
 *
 * BASELINE, ALWAYS PRESENT, NO MATTER WHAT: `"observe"` and `"warn"`.
 * Neither carries a field on `Intervention` capable of touching agent
 * state or citing a claim/checkpoint at all (`intervention.ts`'s own
 * header: "`warn` ... refuses to carry any field capable of touching
 * agent state or revoking a claim ... by construction, not by
 * convention"), so there is nothing about corroboration, freshness, or
 * even agent identity that could make either one structurally
 * impermissible. They are the floor this gate can never fall below.
 *
 * THE `agent` PARAMETER'S REAL JOB: `claim` already carries its own
 * `agentId`, so a caller COULD construct a `claim` belonging to one agent
 * while asking this function about a different one — a mismatch this
 * project's own thesis exists to take seriously (plan §1: the tower acts
 * "using only what th[e] process chooses to report about itself," which
 * presumes the report and the process in question are the SAME one).
 * When `claim.agentId !== agent`, this function fails closed to the
 * baseline ONLY — it does not throw (this codebase's own house style,
 * seen in `lib/contracts/intervention.ts`'s and
 * `lib/conflict/detection-result.ts`'s own typed-result types, prefers a
 * value a caller must inspect over an exception it might not catch, and
 * a `Set` that is simply smaller than it could have been needs no richer
 * error shape to express "insufficient/inconsistent input" at all), and
 * it does not guess which of `agent`/`claim.agentId` is the "real" one. See
 * `.genesis/decisions/0004-gate.md` for why this reading of the literal
 * plan phrase "computed from Corroboration and checkpoint freshness
 * alone" is an input-CONSISTENCY check on the two identities the plan's
 * own signature already carries, not a third, independent gating axis
 * alongside those two.
 *
 * `quarantine` — plan §2, verbatim: "refuses to fire when every claim's
 * corroboration is `self-reported`." This function is evaluated against
 * exactly one claim, so its own share of that refusal reads: refuses to
 * offer `"quarantine"` for a `self-reported` claim. See
 * `.genesis/decisions/0004-gate.md` for why closing the multi-claim
 * ("every claim's") half of that sentence is left to M5, not guessed at
 * here.
 *
 * `"pause"` / `"halt-checkpointed"` — both gated identically by
 * `isCheckpointFresh` (`clock.ts`), matching plan §2's own text for the
 * halt mode built on a checkpoint: "the same freshness refusal as
 * `pause`."
 *
 * `claim.declaredAt`, `claim.ttl`, `claim.mode`, and
 * `checkpoint.resumable`/`checkpoint.checkpointId` are read nowhere in
 * this function, deliberately — see `.genesis/decisions/0004-gate.md`
 * for why each is left alone, the same "don't guess what a field nobody
 * has asked for yet is for" discipline `.genesis/decisions/
 * 0001-contracts.md` Decision 5 and `0003-detection.md` Decision 4
 * already apply elsewhere in this codebase.
 */
export function availableInterventions(
  agent: AgentId,
  claim: ResourceClaim,
  checkpoint: CheckpointDeclaration,
  now: Timestamp,
): AvailableInterventionSet {
  const available = new Set<AvailableInterventionKind>(["observe", "warn"]);

  if (claim.agentId !== agent) {
    return available;
  }

  if (isCheckpointFresh(checkpoint, now)) {
    available.add("pause");
    available.add("halt-checkpointed");
  }

  if (claim.corroboration !== "self-reported") {
    available.add("quarantine");
  }

  return available;
}
