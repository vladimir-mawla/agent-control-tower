/**
 * `Timestamp` — a branded identity for "this string names an instant",
 * used by `ResourceClaim.declaredAt` and `CheckpointDeclaration.declaredAt`
 * (plan §2's literal shapes for both).
 *
 * DELIBERATELY NOT MODELED ON memory-ledger's `CapturedAt`
 * (`captured-at.ts`), even though the shape looks similar at a glance.
 * `CapturedAt`'s `parseCapturedAt` refuses to construct a value later than
 * the `now` it is given, specifically so `ageOf` never has to represent a
 * negative elapsed duration. That rule is wrong for this project: plan §5's
 * failure-suite case 7 is "a heartbeat timestamped after `now` ... must
 * fail closed to 'most stale,' never 'most fresh'" — which requires a
 * future-dated instant to be CONSTRUCTIBLE at all, so a later milestone's
 * detection logic (M3, `lib/conflict/**`, unbuilt) has a real value to
 * fail closed on. Rejecting it at construction, the way `CapturedAt` does,
 * would make that failure-suite fixture impossible to build in the first
 * place. Clock-skew handling itself is explicitly M3's job, not M1's (the
 * plan's M1 section names no timestamp-validation refusal at all) — this
 * file only tags a string as "this is meant to be an instant," the same
 * narrow job `MemoryId` does for identity, and stops there.
 *
 * NO ISO-8601 FORMAT CHECK, DELIBERATELY, FOR THE SAME REASON: a format
 * parser belongs next to the code that actually needs a parsed instant to
 * compute freshness/staleness against a bound (M3's `detectConflicts`, M4's
 * `availableInterventions`) — inventing one now, with no consumer in this
 * milestone to exercise it, would be exactly the kind of validation this
 * repo's own account-wide note warns against building ahead of a real need.
 *
 * Minting matches `memory-id.ts`'s pattern: an opaque token, no invariant
 * beyond "is a string," one blessed constructor that owns only the brand.
 */
declare const timestampBrand: unique symbol;
export type Timestamp = string & { readonly [timestampBrand]: "Timestamp" };

export function timestamp(raw: string): Timestamp {
  return raw as Timestamp;
}
