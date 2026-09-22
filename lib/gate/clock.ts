import type { CheckpointDeclaration } from "../contracts/checkpoint-declaration.js";
import type { Timestamp } from "../contracts/timestamp.js";

/**
 * This module is the FIRST place in this codebase that ever parses a
 * `Timestamp` into a comparable instant. `lib/contracts/timestamp.ts`'s
 * own header names this exact job as deliberately deferred: "a format
 * parser belongs next to the code that actually needs a parsed instant to
 * compute freshness/staleness against a bound (M3's `detectConflicts`,
 * M4's `availableInterventions`)." M3 never needed it —
 * `.genesis/decisions/0003-detection.md` Decision 4 records that
 * `detectConflicts` reads `declaredAt` from nowhere at all, on purpose,
 * because conflict DETECTION never has to ask "is this still fresh," only
 * "is this claimed, right now, as a set." This milestone is the first
 * whose own job — is a self-reported checkpoint fresh enough to act on —
 * cannot be answered without comparing two instants, so the parsing this
 * repo deferred twice already lands here.
 *
 * WHY A POLICY CONSTANT, NOT A FIFTH PARAMETER: `.genesis/PLAN.md` §4 M4
 * names exactly four parameters for `availableInterventions` (`agent`,
 * `claim`, `checkpoint`, `now`) and asks for gating "given ... checkpoint
 * freshness" against "a configured staleness bound" without naming what
 * that bound is anywhere in the plan or in any frozen contract. Inventing
 * a NUMBER here is unavoidable — some bound has to exist for "fresher
 * than a configured staleness bound" to mean anything at all — so it is
 * named, exported, and documented as exactly what it is: a policy value
 * this module owns, not a fact derived from `ResourceClaim`/
 * `CheckpointDeclaration` (neither carries a staleness field of its own;
 * `ResourceClaim.ttl` is a different concept — see this milestone's own
 * `.genesis/decisions/0004-gate.md` for why `ttl` is deliberately never
 * read here at all). Five minutes is a placeholder proportionate to a
 * heartbeat/checkpoint cadence measured in seconds, not an evidence-backed
 * number — there is no evidence in this repository for what the "right"
 * bound is, and this milestone does not pretend otherwise. Exported
 * (rather than a private module-level constant) so this milestone's own
 * boundary tests build their exact N / N+1 fixtures against the real
 * value the gate itself uses, never a hand-copied number that could
 * silently drift out of sync with it.
 */
export const STALENESS_BOUND_MS = 5 * 60 * 1000;

/**
 * Parses `value` into milliseconds since the epoch, or `null` if it
 * cannot be ordered at all. `timestamp.ts`'s own header states plainly
 * that minting a `Timestamp` validates nothing beyond "is a string" —
 * deliberately, so a nonsense string (`timestamp("definitely-not-a-date")`)
 * is a real, constructible fixture, not a rejected one (see that file's
 * Decision 4 and its own committed test using exactly that string). This
 * function is where that deferred format question finally gets an
 * answer, for this milestone's own narrow purpose: `Date.parse` accepts
 * ISO-8601 (what every real fixture in this repo actually uses) and
 * returns `NaN` for anything it cannot make sense of, converted here to
 * `null` so a caller never has to special-case `NaN` itself.
 */
function parseInstantMs(value: Timestamp): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether `checkpoint` is reachable AND fresh enough, relative to `now`,
 * for the checkpoint-anchored interventions (`pause`, and the halt mode
 * that reuses the same checkpoint) to be offered at all — plan §2,
 * verbatim: "`pause` ... refuses ... to be available at all unless the
 * paired `CheckpointDeclaration` is `reachable` and fresher than a
 * configured staleness bound," and, for the halt mode built on the same
 * checkpoint, "the same freshness refusal as `pause`." Both share
 * identical gating here, for that reason — `checkpoint.resumable` is
 * read nowhere in this function, deliberately: nothing in the plan's own
 * text conditions either variant's AVAILABILITY on `resumable` (it only
 * conditions how honestly that halt mode must be DESCRIBED once
 * selected, a fact for whichever milestone actually constructs the value
 * to disclose, not a gate this milestone enforces on entry — see this
 * milestone's own `.genesis/decisions/0004-gate.md`).
 *
 * FAILS CLOSED ON EVERY AXIS THIS FUNCTION CANNOT VERIFY, NEVER TOWARD
 * "FRESH":
 *   - `checkpoint.reachable === false` — decisive on its own; an agent's
 *     own claim that a checkpoint is not reachable is never
 *     second-guessed toward more permission.
 *   - either instant fails to parse — "cannot order, treat as
 *     simultaneous/conflicting" is `.genesis/decisions/0003-detection.md`'s
 *     own phrase for a different comparison (claim timestamps); the
 *     identical discipline, re-derived independently for this milestone's
 *     own clock arithmetic rather than imported, resolves here to "cannot
 *     order, treat as stale" — a checkpoint the gate cannot place in time
 *     is not one it can call current.
 *   - `declaredAt` is after `now` (negative elapsed time — a clock-skewed
 *     or dishonestly future-dated checkpoint) — never treated as "the
 *     freshest possible instant," mirroring plan §5's failure-suite case
 *     7 ("a heartbeat timestamped after `now` ... must fail closed to
 *     'most stale,' never 'most fresh'"), re-derived here for a
 *     checkpoint instead of a heartbeat.
 *   - elapsed time strictly greater than `STALENESS_BOUND_MS` — stale, by
 *     exactly one millisecond or by a year, no distinction drawn between
 *     the two.
 *
 * Elapsed time exactly equal to `STALENESS_BOUND_MS` is still fresh — the
 * boundary itself belongs to the permitted side, checked by an explicit
 * N vs. N+1 test in this milestone's own test suite, the same discipline
 * `shadow-run`'s own `SimulatorTrust` threshold test uses.
 */
export function isCheckpointFresh(checkpoint: CheckpointDeclaration, now: Timestamp): boolean {
  if (!checkpoint.reachable) return false;
  const declaredMs = parseInstantMs(checkpoint.declaredAt);
  const nowMs = parseInstantMs(now);
  if (declaredMs === null || nowMs === null) return false;
  const elapsedMs = nowMs - declaredMs;
  if (elapsedMs < 0) return false;
  return elapsedMs <= STALENESS_BOUND_MS;
}
