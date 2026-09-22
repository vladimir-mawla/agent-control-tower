import type { DetectedConflict } from "./detected-conflict.js";

/**
 * `detectConflicts` cannot return a bare `Conflict[]`/`DetectedConflict[]`
 * and still satisfy plan §4 M3's own "what it refuses" bullet: "to crash
 * on a hostile claims array (throwing getter, `Proxy`)" — confirmed
 * directly, verbatim, by the falsifiability check in the same section:
 * "a second test feeds a `Proxy` that throws on property access and
 * asserts a typed failure result, never an uncaught exception." A bare
 * array return type has no slot to carry "detection could not run" at
 * all; the caller would have no choice but to wrap every call in its own
 * `try`/`catch`, which is exactly the "an exception might be forgotten"
 * failure mode `lib/contracts/intervention.ts`'s own
 * `HaltForcedResult`/`assertValidHaltForced` already reject in favor of a
 * typed result. This is the second gap this milestone closes beyond what
 * `.genesis/PLAN.md` §4's literal signature states (the first being
 * `DetectedConflict`'s `id` field, `detected-conflict.ts`) — both
 * documented together in `.genesis/decisions/0003-detection.md`.
 */
export interface DetectionFailure {
  /**
   * Which of the two input arrays (or an element inside it) was hostile.
   * Two values, not one generic "hostile-input," so a caller — and this
   * milestone's own tests — can assert exactly where detection gave up,
   * not merely that it gave up.
   */
  readonly kind: "hostile-claims-input" | "hostile-heartbeats-input";
  /** `String(error)` (or `error.message` for a real `Error`) from the exact exception `detectConflicts` caught — kept for a human/log to read, never parsed by any code in this milestone. */
  readonly message: string;
}

/**
 * Deliberately the same "typed result, not a thrown exception" shape
 * `lib/contracts/intervention.ts`'s `HaltForcedResult` already uses —
 * re-derived independently for this module rather than imported, because
 * `lib/contracts/**` is frozen and this milestone must not add a new
 * export to it (scope: `lib/conflict/**` only).
 */
export type DetectionResult =
  | { readonly ok: true; readonly conflicts: readonly DetectedConflict[] }
  | { readonly ok: false; readonly error: DetectionFailure };
