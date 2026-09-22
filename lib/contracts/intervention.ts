import type { CheckpointId, ConflictId, ResourceClaimId } from "./ids.js";
import type { HumanId } from "./human-id.js";
import type { NonEmptyArray } from "./non-empty-array.js";

/**
 * THE CLAIM THIS FILE ACTUALLY MAKES ABOUT `halt`/`forced`, STATED ONCE
 * HERE AT ITS TRUE STRENGTH — REWRITTEN A SECOND TIME after independent
 * verification reported that the first rewrite was ALSO too strong, in
 * the harmful direction: it told a reader "reachable only via a
 * deliberate, visible cast... in cleartext," which reads as a claim of
 * completeness a scanner could chase — and two further working routes,
 * with no cast naming the brand at all, promptly disproved it (see
 * `human-id.ts`'s header for both, and `.genesis/decisions/
 * 0001-contracts.md` Decision 2 for the full incident report across all
 * rounds). This paragraph is the one place this project states what it
 * actually relies on, and does not restate it more strongly anywhere else.
 *
 * WHAT THE TYPE SYSTEM ACTUALLY GUARANTEES: an unauthorized `halt`/`forced`
 * cannot be constructed ACCIDENTALLY (a literal missing `authorizedBy` or
 * `conflictId` is a compile error — `@ts-expect-error` proofs in
 * `__tests__/intervention.test.ts`) or CONVENIENTLY via an ordinary,
 * visibly-named cast (no function anywhere in `lib/` mints a `HumanId`,
 * and `__tests__/human-id.test.ts` resolves every cast's target type
 * through the real checker's own symbol/alias resolution over every `.ts`
 * file under `lib/`). This is the COMPOSITION of three checks, and the
 * claim below holds only for the composed set — see `human-id.ts`'s
 * header for why a claim stated for any ONE of the three, alone, was
 * independently found false twice: `__tests__/file-inventory.test.ts`
 * makes "every `.ts` file" and "every file INSIDE `lib/`" the same set
 * (no `.d.ts`/`.js`/other-extension file may exist there at all), AND
 * `__tests__/import-containment.test.ts` makes "every file `lib/`'s own
 * code can reach" and "every file inside `lib/`" the same set (no import
 * anywhere in `lib/**` may resolve OUTSIDE `lib/**`, checked by
 * resolving each specifier to a real absolute path, never by pattern-
 * matching its text). Only with both in place does "the scan reads every
 * `.ts` file under `lib/`, and aliasing/re-exporting doesn't help" become
 * a true statement about the whole graph rather than an assumption about
 * one directory. That is genuinely useful and genuinely narrow — it is
 * NOT, and is not claimed anywhere in this codebase to be, a guarantee
 * that a `HumanId` cannot be forged at all.
 * IT CANNOT BE: TypeScript is deliberately unsound (`any` is a designed
 * escape hatch; a generic function's type parameter can be instantiated
 * with the brand at the CALL SITE, with no cast naming the brand anywhere
 * inside the function; `JSON.parse` returns `any`; `Object.assign` and
 * declaration merging are further routes) — the set of routes from a raw
 * value to a branded type is NOT ENUMERABLE, and `human-id.ts`'s own two
 * concrete examples (routes A and B) are exactly that: EXAMPLES of an
 * open-ended class, not the class itself. A scanner that closes today's
 * known routes and calls the class closed is a false claim of
 * completeness — this project tried a narrower version of exactly that
 * once already and is not repeating the mistake at a larger scale.
 *
 * SO WHAT DOES `halt`/`forced`'s SAFETY ACTUALLY REST ON? Not "nobody can
 * forge a `HumanId`" — that claim is unenforceable in this language by
 * construction, and staking the project's central design commitment on
 * an unenforceable claim would guarantee a permanent, growing gap between
 * what this file says and what the code can prove, exactly the gap the
 * last two rounds kept finding. The claim this project actually relies on
 * instead is a property of CODE THIS PROJECT CONTROLS, not of a value's
 * provenance, which it cannot control once TypeScript's escape hatches are
 * in play: **no module under `lib/` ever MINTS a `HumanId`, or assembles a
 * `halt`/`forced` `Intervention` from scratch — the only way `lib/`'s own
 * code may ever produce one is by copying `authorizedBy`/`conflictId`
 * verbatim from a value that arrived as an INPUT to whichever function is
 * constructing it, handed in by that function's own caller, across the
 * library's boundary.** A forged `HumanId` a CALLER constructs and passes
 * in is that caller's lie, told outside this library — not a lie `lib/`
 * told about itself, which is the one failure mode this whole project
 * exists to refuse (plan §1: "the tower decides what to do... using only
 * what that process chooses to report about itself"). This is not a new
 * idea invented for this rewrite: the plan's own M4 section (§4) already
 * commits to exactly this shape for the gate — "to ever include
 * `halt`/`forced` in its output at all — the return type has structurally
 * no slot for it, because this engine has no channel to a human and must
 * not manufacture authorization," checked by a source-scan that "greps
 * this package's return type declarations and fails the build if
 * `'forced'` appears anywhere in `lib/gate/**`'s non-test source." M5's
 * own refusal list (plan §4) is the analogous, slightly weaker rule for
 * `arbitrate` (which DOES need to be able to select `forced`, given a
 * valid authorization): "to produce `halt`/`forced` without a
 * `humanAuthorization` whose `conflictId` matches the specific conflict
 * being ruled on" — i.e. `arbitrate` may copy fields from an authorization
 * it received, never mint one.
 *
 * WHAT THIS MEANS FOR THIS MILESTONE, HONESTLY: M1 builds no engines, so
 * this property has no code to check yet — `lib/gate/**` and
 * `lib/arbitrate/**` do not exist. This paragraph is therefore a BUILD
 * REQUIREMENT recorded now for M4/M5 to satisfy and prove with their own
 * source-scan tests when they exist (M4's version is already named,
 * verbatim, in the plan itself, quoted above; M5's own scan would need to
 * confirm every `authorizedBy`/`conflictId` pair `arbitrate` ever places
 * into a returned `Intervention` was read off its own `humanAuthorization`
 * parameter, never freshly constructed) — not a claim this file makes
 * about code that does not exist. What THIS milestone's own tests
 * (`human-id.test.ts`, `intervention.test.ts`) DO check today is narrower
 * and real: no minting function exists in `lib/contracts` itself, and no
 * ordinary, visibly-named cast into `HumanId` appears in this milestone's
 * own non-test source (there is none — this milestone builds no engines
 * either). The brand and its scan remain worth keeping for exactly the
 * failure mode they actually catch (an engineer reaching for a visible
 * cast, aliased or not) — one piece of evidence, not the whole guarantee.
 *
 * ONE MORE HONEST LIMIT, NAMED HERE RATHER THAN LEFT IMPLICIT: even a
 * perfectly-upheld "`lib/` never mints one" property does not stop a
 * CALLER of this library (a future M6 domain script, or M8's demo app)
 * from constructing a forged `HumanId` itself and passing it into
 * `arbitrate` as part of a fabricated `humanAuthorization`. This project
 * does not claim to solve that — verifying that an incoming authorization
 * is genuine (a real signature, a real session check) is real I/O this
 * pure `lib/` deliberately does not have (`.genesis/PLAN.md`'s own "no
 * real I/O in lib" discipline) and is out of scope for every milestone
 * this plan names. What this project claims is narrower and, unlike "no
 * forgery anywhere," actually true: the TOWER's own code never manufactures
 * an authorization on its own initiative. A caller lying to the tower is a
 * different, smaller, and correctly-attributed problem than the tower
 * lying to itself.
 *
 * THE TWO HONEST RESIDUALS, NAMED TOGETHER, PLAINLY, AS OF THIS ROUND —
 * everything else on this axis (an ordinary cast, aliased or not; a
 * non-`.ts` file inside `lib/`; an import reaching outside `lib/`) is
 * closed by the three composed checks above:
 *   1. The type checker's own unsoundness, INSIDE checked `lib/` source
 *      (routes A/B — `any`, a generic instantiated at its call site, and
 *      whatever else that open-ended class contains).
 *   2. A CALLER of this library, OUTSIDE `lib/` entirely, forging an
 *      authorization and passing it in as a parameter — out of scope for
 *      every milestone this plan names, and correctly so.
 */

/**
 * `Intervention` — the closed enum at the centre (plan §2). Five top-level
 * variants (`observe`, `warn`, `pause`, `halt`, `quarantine`), with `halt`
 * carrying a closed 2-value `mode` — the same shape decision-engine uses
 * for `escalate`'s four sub-causes (one outcome name, several mechanically
 * distinct, type-distinguishable causes; `decision-engine/lib/contracts/
 * decision.ts`), applied here to the one intervention whose two causes
 * have opposite risk profiles.
 *
 * WHAT EACH VARIANT REFUSES (plan §2, verbatim reasoning, restated per
 * field so each refusal is checkable against the type below, not just
 * against prose):
 *
 *   - `observe`     — carries no data. It structurally cannot justify or
 *                      record an action it didn't take.
 *   - `warn`        — carries only `message: string`. No field capable of
 *                      touching agent state or revoking a claim exists on
 *                      this variant — a reviewer can confirm that by
 *                      reading the type, not the call sites.
 *   - `pause`       — refuses to be constructed without `checkpointId`.
 *   - `halt` /
 *     `checkpointed` — the same `checkpointId` requirement as `pause`.
 *                      Declared, honestly, as best-effort-resumable, not
 *                      guaranteed reversible once selected (a fact for
 *                      callers to know, not something this type can
 *                      enforce by itself).
 *   - `halt` /
 *     `forced`      — THE central design commitment (plan §4, M1; see
 *                      also `.genesis/PLAN.md`'s own "riskiest design
 *                      decision" section, and this file's own header
 *                      above for the claim's exact, verified strength).
 *                      Refuses to COMPILE without `authorizedBy: HumanId`
 *                      AND `conflictId: ConflictId` together — omitting
 *                      either is a compile error at the object-literal
 *                      call site, not a policy check caught later. No
 *                      engine milestone (M3, M4, or M5) should reach for
 *                      a convenience constructor to satisfy that
 *                      requirement, because none exists — see
 *                      `human-id.ts`'s header for how that is enforced
 *                      past what a required field alone can guarantee,
 *                      and `assertValidHaltForced` below for the narrower,
 *                      honestly-scoped runtime guard against a cast that
 *                      drops or blanks a field entirely. Mirrors a fact
 *                      read directly in agent-trust-layer's own
 *                      architecture snapshot: "refuses ▸ revocation not
 *                      checked, unless a human signed off by name."
 *   - `quarantine`  — refuses to fire with an empty `revokedClaims`:
 *                      `NonEmptyArray<ResourceClaimId>` (non-empty-
 *                      array.ts), not `ResourceClaimId[]` plus a runtime
 *                      length check. Quarantine claims to *revoke*
 *                      something; an empty revocation list is not a
 *                      quarantine, it is an `observe` wearing a costume.
 */
export type Intervention =
  | { readonly kind: "observe" }
  | { readonly kind: "warn"; readonly message: string }
  | { readonly kind: "pause"; readonly checkpointId: CheckpointId }
  | { readonly kind: "halt"; readonly mode: "checkpointed"; readonly checkpointId: CheckpointId }
  | {
      readonly kind: "halt";
      readonly mode: "forced";
      readonly authorizedBy: HumanId;
      readonly conflictId: ConflictId;
    }
  | { readonly kind: "quarantine"; readonly revokedClaims: NonEmptyArray<ResourceClaimId> };

/**
 * Exhaustiveness helper for `switch (intervention.kind)` (and, for `halt`,
 * a nested `switch (intervention.mode)` inside the `"halt"` case) — same
 * pattern as decision-engine's `assertNeverOutcome` / shadow-run's
 * `assertNeverReconciliation` / memory-ledger's `assertNeverBeliefAnswer`.
 * Never called at runtime (the `never` parameter type makes that
 * impossible for any value TypeScript itself considers reachable); its
 * only job is to make an unhandled variant a COMPILE error at the call
 * site the moment a sixth top-level kind (or a third `halt` mode) is ever
 * added. `Intervention` itself stays frozen at five kinds / two `halt`
 * modes for this milestone, so `__tests__/intervention.test.ts`
 * demonstrates the mechanism failing on an equivalent LOCAL six-kind
 * stand-in type rather than dishonestly widening the real one just to
 * prove a point — the same choice shadow-run's own
 * `reconciliation.test.ts` documents making for the identical reason.
 */
export function assertNeverIntervention(value: never): never {
  throw new Error(`Unreachable: unhandled Intervention ${JSON.stringify(value)}`);
}

/** The `halt`/`forced` variant, named on its own so `assertValidHaltForced` below has something to accept without repeating the full six-member union inline. */
export type HaltForced = Extract<Intervention, { kind: "halt"; mode: "forced" }>;

export interface InvalidHaltForced {
  readonly kind: "missing-authorized-by" | "missing-conflict-id";
  readonly received: unknown;
}

export type HaltForcedResult = { readonly ok: true } | { readonly ok: false; readonly error: InvalidHaltForced };

/**
 * The parallel RUNTIME guard the plan's own M1 falsifiability check
 * demands (`.genesis/PLAN.md` §4, M1): "a parallel runtime guard
 * (`assertValidHaltForced`) independently rejects a value that reached
 * this shape via an unsafe cast — the type check alone is not treated as
 * sufficient."
 *
 * ITS TRUE, VERIFIED SCOPE — NARROWED HERE AFTER INDEPENDENT VERIFICATION
 * REPORTED A WORKING BYPASS OF AN EARLIER, OVERSTATED VERSION OF THIS
 * COMMENT: this function checks that `authorizedBy` and `conflictId` are
 * PRESENT, non-empty strings at runtime. That catches a cast that drops
 * or blanks a field entirely — e.g. `{ kind: "halt", mode: "forced",
 * conflictId: someId } as unknown as HaltForced` (no `authorizedBy` at
 * all) or one where a field survived as `""`/`undefined`. It does NOT,
 * and CANNOT, verify that `authorizedBy` names a real, consenting human,
 * or that `conflictId` genuinely corresponds to the conflict being ruled
 * on — a FULLY-FORMED cast such as `{ kind: "halt", mode: "forced",
 * authorizedBy: "not-a-real-human", conflictId: "fake-conflict" } as
 * unknown as HaltForced` satisfies this check completely, by design, not
 * by oversight: verifying either fact for real would require a secret
 * this function does not and should not hold (`lib/contracts` is a pure,
 * frozen, I/O-free type library — see `.genesis/PLAN.md`'s own "no real
 * I/O in lib" discipline) or an external record to check against, which
 * is `HumanAuthorization`-style matching left to M5's `arbitrate`
 * (unbuilt) to build, if it ever does, against real infrastructure this
 * milestone does not have. A check computed from data this function
 * already holds (e.g. a hash of `authorizedBy`+`conflictId`) would add
 * NOTHING here: an attacker with `as unknown as X` already has source
 * access to `lib/contracts` and could compute the identical hash for
 * their own fabricated fields, so such a check would be theater, not
 * defense — deliberately not added for that reason. This is the same
 * "no TypeScript design can stop a deliberate cast" property this file's
 * own header states for the type system as a whole, one layer down: a
 * required field stops an ACCIDENTAL assignment; this function additionally
 * stops a CARELESS cast that never bothered to populate every field; NEITHER
 * stops a DELIBERATE, fully-formed one — see `.genesis/decisions/
 * 0001-contracts.md` Decision 2 for the incident this narrowing responds to,
 * and `__tests__/intervention.test.ts` for a test that reproduces the exact
 * reported bypass and pins that it passes this check today, as a disclosed,
 * accepted limit, not a silently-undiscovered one.
 *
 * Deliberately returns a typed result rather than throwing directly, the
 * same shape `parseConfidence`/`parseCapturedAt` use elsewhere in the
 * sibling projects: a caller (M5's `arbitrate`, unbuilt) gets a value it
 * must inspect, not an exception it might forget to catch.
 */
export function assertValidHaltForced(value: HaltForced): HaltForcedResult {
  if (typeof value.authorizedBy !== "string" || value.authorizedBy.length === 0) {
    return { ok: false, error: { kind: "missing-authorized-by", received: value.authorizedBy } };
  }
  if (typeof value.conflictId !== "string" || value.conflictId.length === 0) {
    return { ok: false, error: { kind: "missing-conflict-id", received: value.conflictId } };
  }
  return { ok: true };
}
