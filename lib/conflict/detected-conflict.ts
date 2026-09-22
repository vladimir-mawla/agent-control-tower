import type { AgentId, ConflictId, ResourceId } from "../contracts/ids.js";
import { conflictId } from "../contracts/ids.js";
import type { Conflict } from "../contracts/conflict.js";
import type { NonEmptyArray } from "../contracts/non-empty-array.js";

/**
 * `DetectedConflict` — the richer value `detectConflicts` actually returns,
 * closing the gap `.genesis/decisions/0001-contracts.md` Decision 3 named
 * and deliberately left open: `Conflict` (`lib/contracts/conflict.ts`) is a
 * bare 3-value enum with no field to carry an id, but
 * `Intervention`'s `halt`/`forced` variant needs a `conflictId: ConflictId`
 * to bind an authorization to "this conflict specifically," and
 * `.genesis/DONE.html`'s locked spec requires a ruling to "always cite the
 * conflict id, the rule, and the evidence." M1's own ADR named this
 * explicitly as a call for whichever milestone first needs to look a
 * conflict up by id, "when it can verify the answer against real
 * `detectConflicts`... code rather than a guess made before either
 * exists" — this is that milestone. See this milestone's own
 * `.genesis/decisions/0003-detection.md` for the decision record.
 *
 * `Conflict` itself (`lib/contracts/conflict.ts`) is untouched — it stays
 * exactly the frozen 3-value enum the plan names, and lives here as the
 * `kind` field. This file does not modify `lib/contracts/**` at all; it
 * only builds a new type on top of it, in `lib/conflict/**`, the module
 * this milestone owns.
 *
 * FIELDS, AND WHY EACH ONE:
 *   - `id`            — a `ConflictId`, minted DETERMINISTICALLY from
 *                        `kind` + `resourceId` + the sorted, deduplicated
 *                        set of participant `agentId`s (see
 *                        `deriveConflictId` below), never from array
 *                        position or claim/heartbeat order. This is not
 *                        an incidental implementation detail — it is the
 *                        actual mechanism `detectConflicts`'s
 *                        order-independence and idempotence proofs rest
 *                        on: the same logical conflict, fed in any order,
 *                        any number of times, produces the identical id,
 *                        so two result arrays can be compared by
 *                        deep-equality without a separate "same conflict,
 *                        different id" normalization step.
 *   - `kind`          — the frozen `Conflict` enum value, unchanged.
 *   - `resourceId`    — the resource the collision is about. Every one of
 *                        plan §2's three `Conflict` kinds is scoped to a
 *                        single resource ("two claims want... the same
 *                        resource," "a reader holds data a live writer has
 *                        claimed" (on that resource), "an agent touched a
 *                        resource it never claimed") — there is no
 *                        multi-resource conflict shape anywhere in the
 *                        plan, so this field is a single `ResourceId`, not
 *                        an array.
 *   - `agentIds`      — the distinct agents party to this specific
 *                        conflict, sorted ascending by their raw string
 *                        value for the same order-independence reason as
 *                        `id` above. `NonEmptyArray` (already frozen in
 *                        `lib/contracts/non-empty-array.ts`) because a
 *                        conflict with zero participants is not a
 *                        conflict — the type itself refuses that shape,
 *                        matching the same "tuple type, not a runtime
 *                        length check" discipline `Intervention.quarantine`
 *                        already uses for `revokedClaims`.
 *
 * WHAT THIS TYPE DELIBERATELY DOES NOT CARRY, AND WHY THAT GAP STAYS OPEN:
 * no `claimIds` / `ResourceClaimId[]` field. `Intervention.quarantine`
 * names `NonEmptyArray<ResourceClaimId>` as what it revokes, which
 * presumes individual claims are identifiable — but `ResourceClaim`
 * (frozen, `lib/contracts/resource-claim.ts`) carries no `id` field of its
 * own, and `0001-contracts.md` Decision 3 left THAT gap, deliberately,
 * for whichever milestone first needs to revoke a specific claim rather
 * than merely detect that one exists. `detectConflicts`'s own job (plan
 * §4, M3: "pure detection... find the conflicts," no gating, no
 * arbitration, no interventions) never needs to name an individual claim
 * for revocation — only M4's gate and M5's arbitration do, once
 * `quarantine` becomes a real candidate intervention. Inventing a
 * `ResourceClaimId` scheme now, with no consumer in this milestone to
 * test it against, would repeat the exact mistake `0001-contracts.md`
 * Decision 3 already refused to make for `Conflict`'s id — freezing a
 * guessed shape before the milestone that actually needs it can verify
 * the guess. This milestone closes the `ConflictId` half of the gap
 * because it is the first milestone that needs one; the
 * `ResourceClaimId`-on-a-claim half stays open, explicitly, for M4/M5.
 */
export interface DetectedConflict {
  readonly id: ConflictId;
  readonly kind: Conflict;
  readonly resourceId: ResourceId;
  readonly agentIds: NonEmptyArray<AgentId>;
}

/**
 * Deterministic `ConflictId` minting: `kind` + `resourceId` + the sorted,
 * deduplicated participant `agentId`s, joined with a separator ("|") that
 * cannot appear inside any of the three id/enum types involved (`Conflict`
 * is one of exactly three fixed literal strings with no `|` in any of
 * them; `AgentId`/`ResourceId` are opaque tokens this milestone does not
 * constrain the alphabet of — see the note on ambiguity below). Reuses
 * `lib/contracts/ids.ts`'s own `conflictId(raw: string): ConflictId`
 * minting function rather than inventing a second one — `ConflictId` has
 * exactly one blessed constructor, and this is it.
 *
 * WHY DETERMINISTIC, NOT RANDOM (a UUID per detected conflict): a random
 * id would make `detectConflicts` fail its own order-independence and
 * idempotence proofs by construction — the same logical conflict, run
 * twice or fed in a different claim order, would get two different
 * random ids, and no deep-equality assertion could ever pass. Determinism
 * is not a nice-to-have here; it is the mechanism the falsifiability
 * check in this milestone's `.genesis/decisions/0003-detection.md` and
 * `__tests__/order-independence.test.ts` actually rely on.
 *
 * HONEST LIMIT, NAMED RATHER THAN SILENTLY ACCEPTED: joining
 * unconstrained-alphabet tokens with a fixed separator can theoretically
 * collide (`agentId("a|b")` plus resource `"c"` collides with agent
 * `"a"` plus resource `"b|c"` under a naive join). This is not fixed here
 * with an escaping scheme, because `lib/contracts/ids.ts` states plainly
 * that these tokens carry "no invariant beyond being a string" and this
 * milestone has no evidence real agent/resource ids will ever contain
 * `|` — inventing an escaping scheme against a hypothetical adversarial
 * id would be exactly the kind of unrequested flexibility this account's
 * own standing note (`speculative-flexibility-costs-rounds.md`) warns
 * costs rounds later. `__tests__/detected-conflict.test.ts` pins this as
 * a disclosed, accepted limit with a real (if contrived) colliding
 * fixture, not a silently-undiscovered one.
 */
export function deriveConflictId(
  kind: Conflict,
  resourceId: ResourceId,
  agentIds: readonly AgentId[],
): ConflictId {
  const sortedUniqueAgents = Array.from(new Set<string>(agentIds)).sort();
  return conflictId(`${kind}|${String(resourceId)}|${sortedUniqueAgents.join(",")}`);
}
