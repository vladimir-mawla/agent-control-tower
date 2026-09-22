import type { Conflict, ConflictSeverity } from "../../lib/contracts/index.js";
import type { BlastRadius } from "./service-catalog.js";

/**
 * `computeSeverity` — the function `.genesis/PLAN.md` §2 names but no
 * frozen contract or engine milestone ever builds: "Each severity is
 * computed from the conflicting resource's declared blast radius and the
 * conflict kind — never asserted directly by an agent about itself."
 * `lib/contracts/conflict-severity.ts`'s own header repeats this almost
 * verbatim and states plainly "this file only fixes the three names;
 * nothing in this milestone computes one." Grepped directly to confirm
 * this is a real, unclosed gap, not a naming mismatch: `grep -rn
 * "computeSeverity\|blast radius" lib/` before this file existed returned
 * only that one header comment, no implementation anywhere. This is the
 * identical "the plan names a computation it never builds, closed by
 * whichever milestone first needs a real answer" pattern this codebase's
 * own `Heartbeat` (`lib/conflict/heartbeat.ts`) and `HumanAuthorization`
 * (`lib/arbitrate/human-authorization.ts`) already document — closed here,
 * in `domains/incident-response/**`, because this is the first (and only)
 * milestone with a real scenario to test the answer against.
 *
 * BOTH INPUTS ACTUALLY MATTER, DELIBERATELY — NOT JUST BLAST RADIUS:
 * `blastRadius` alone sets a baseline
 * (`small→benign`, `medium→contained`, `large→corrupting`); `kind` can
 * only ever move severity UP from that baseline, never down, and only for
 * exactly one kind: `undeclared-access`. Plan §2's own text is explicit
 * that this kind "refuses to be treated as any weaker than the other
 * two... a claim invented after the fact cannot be corroborated
 * prospectively at all; retroactive claims are not claims" — a real
 * refusal, not a suggestion, so this file enforces it structurally: an
 * `undeclared-access` conflict is bumped exactly one severity step above
 * whatever `write-write`/`write-read` would receive on the identical
 * resource, capped at `corrupting` (there is no fourth, higher severity to
 * bump into). `write-write` and `write-read` are deliberately NOT
 * distinguished from each other here — the plan draws no severity
 * distinction between them (both are real, declared, corroborated claims
 * in tension; only the retroactive, undeclared case is named as worse),
 * and inventing one now with no requirement naming it would be exactly the
 * unrequested flexibility this account's own standing note
 * (`speculative-flexibility-costs-rounds.md`) warns against.
 *
 * NO NUMERIC EVIDENCE BACKS THE BASE MAPPING OR THE ONE-STEP BUMP — the
 * identical, honestly-stated limitation `lib/gate/clock.ts`'s
 * `STALENESS_BOUND_MS` and `lib/arbitrate/severity-ladder.ts`'s
 * `SEVERITY_MINIMUM_RUNG` already disclose for their own invented policy
 * values: some assignment has to exist for "computed from blast radius and
 * kind" to mean anything at all, and this repository has no real
 * incident-response corpus to derive the "right" one from.
 */
const BASE_SEVERITY_BY_BLAST_RADIUS: Readonly<Record<BlastRadius, ConflictSeverity>> = {
  small: "benign",
  medium: "contained",
  large: "corrupting",
};

/** `benign → contained → corrupting`, one step, capped — never wraps and never skips a step, so a caller can trust "one step worse," not "however much worse this function feels like today." */
function oneStepMoreSevere(severity: ConflictSeverity): ConflictSeverity {
  if (severity === "benign") return "contained";
  return "corrupting"; // both "contained" and "corrupting" already-at-or-above the cap bump to (or stay at) "corrupting".
}

export function computeSeverity(kind: Conflict, blastRadius: BlastRadius): ConflictSeverity {
  const base = BASE_SEVERITY_BY_BLAST_RADIUS[blastRadius];
  return kind === "undeclared-access" ? oneStepMoreSevere(base) : base;
}
