/**
 * `NonEmptyArray<T>` — a tuple-shaped type, not a runtime length check.
 * Plan §4 (M1, "what it refuses"): "a `quarantine` literal with an empty
 * `revokedClaims` array must not compile (a non-empty-array type, not a
 * runtime length check)." `Intervention`'s `quarantine` variant
 * (intervention.ts) is the one field in this milestone that needs this.
 *
 * WHY `readonly [T, ...T[]]`, NOT A CLASS OR A BRANDED `T[]`: TypeScript
 * already treats a tuple type with a required first element as requiring
 * at least one element for any array LITERAL assigned to it — `[]` is not
 * assignable to `readonly [T, ...T[]]`, and neither is `const xs: T[] = [];
 * const ys: NonEmptyArray<T> = xs;` without a cast or a narrowing check.
 * That is exactly the "does not compile," not "throws at runtime," shape
 * the plan's own success criterion asks for. A branded `T[] & { __brand }`
 * would need a runtime `parse` function to ever produce a value (the same
 * "opaque token, needs a boundary constructor" shape `MemoryId`-style
 * brands use elsewhere) and would still let `[] as NonEmptyArray<T>` slip
 * through a cast just as easily as any other brand does — no safer than
 * the tuple, and more machinery for it.
 *
 * `isNonEmptyArray` exists for the one legitimate remaining gap: narrowing
 * an already-existing `readonly T[]` of unknown length (e.g. a caller
 * building `revokedClaims` from a filter/map at a later milestone) into a
 * `NonEmptyArray<T>` without an unsafe cast. It is a real runtime length
 * check, deliberately confined to this one narrowing function rather than
 * being how `quarantine` itself is validated — the type still does the
 * actual refusing for any object literal written directly.
 */
export type NonEmptyArray<T> = readonly [T, ...T[]];

export function isNonEmptyArray<T>(value: readonly T[]): value is NonEmptyArray<T> {
  return value.length > 0;
}
