import type { AgentId, CheckpointId, ResourceClaimId, ResourceId } from "../contracts/ids.js";

/**
 * `ArbitrationParticipant` — closes the `ResourceClaimId`-identifies-a-claim
 * half of `.genesis/decisions/0001-contracts.md` Decision 3's named gap,
 * the half `.genesis/decisions/0004-gate.md` Decision 3 explicitly left
 * open "for M5 (`arbitrate`) to close against its own real code."
 *
 * **THE RULING, ARGUED IN FULL IN `.genesis/decisions/0005-arbitration.md`
 * Decision 1 — a `lib/arbitrate`-owned wrapper, not a `lib/contracts`
 * unfreeze:** `ResourceClaim` (frozen, M1) stays exactly six fields, no
 * `id`. This type pairs a `ResourceClaimId` with the two facts `arbitrate`
 * actually needs to correlate a claim back to a conflict and, separately,
 * to a checkpoint — never the whole `ResourceClaim` object, and never a
 * second `CheckpointDeclaration` value either (see the field-by-field
 * reasoning below).
 *
 * FIELDS, AND WHY EACH ONE STOPS WHERE IT DOES:
 *
 *   - `agentId` / `resourceId` — the two facts `DetectedConflict`
 *     (`lib/conflict/detected-conflict.ts`, frozen at M3) already
 *     publishes about a conflict (`resourceId: ResourceId`,
 *     `agentIds: NonEmptyArray<AgentId>`). `arbitrate` matches a
 *     participant to a conflict by these two fields alone — the same
 *     `(resourceId, agentId)` pair `lib/conflict/detect-conflicts.ts`'s own
 *     `claimedPairKey` already uses for the identical "does this claim
 *     belong to this collision" question, re-derived independently here
 *     rather than imported (that function is private to `lib/conflict/**`
 *     and this milestone must not reach into a sibling module's internals).
 *   - `claimId` — the `ResourceClaimId` this milestone mints (or is handed,
 *     depending on the caller's own claim-tracking scheme, left
 *     deliberately open the same way `0001-contracts.md` Decision 3 left
 *     the minting STRATEGY open) for the one, specific claim this
 *     participant record is about. This is the value `quarantine`'s
 *     `revokedClaims: NonEmptyArray<ResourceClaimId>` (frozen,
 *     `lib/contracts/intervention.ts`) actually needs — the whole reason
 *     this type exists.
 *   - `checkpointId` — OPTIONAL, deliberately: not every agent party to a
 *     conflict has declared a checkpoint at all (`CheckpointDeclaration` is
 *     an agent's own, voluntary claim — `lib/contracts/checkpoint-
 *     declaration.ts`'s own header: "only the agent that is actually
 *     running can know its own safe-stop points"). `exactOptionalPropertyTypes`
 *     (`tsconfig.lib.json`) makes "omit the field" and "set it to
 *     `undefined`" two different, both-enforced states — a caller with no
 *     checkpoint for this participant OMITS the field, never sets it to
 *     `undefined` explicitly.
 *
 * WHY NOT THE WHOLE `CheckpointDeclaration`, OR THE WHOLE `ResourceClaim`:
 * `arbitrate` never re-derives freshness, reachability, or corroboration —
 * those are M4's (`lib/gate/**`, settled) own job, already folded into the
 * `AvailableInterventionSet` `arbitrate` receives as a separate parameter.
 * By the time a kind reaches `available`, the gate has already decided it
 * is permitted; `arbitrate` only ever needs the one concrete id
 * (`checkpointId`) to POPULATE a `pause`/`halt`/`checkpointed` literal it
 * has already decided, on other grounds, that it may construct. Carrying
 * the full `CheckpointDeclaration` (or `ResourceClaim`) here would invite
 * `arbitrate` to silently re-derive a fact only `lib/gate/**` is
 * authoritative for — exactly the kind of duplicated-source-of-truth risk
 * `lib/contracts/checkpoint-declaration.ts`'s own header already warns
 * against for its `corroboration` field.
 *
 * MULTIPLE PARTICIPANTS CAN AGREE OR DISAGREE ON `checkpointId`: a
 * conflict can name several agents, each with its own claim and (at most)
 * one declared checkpoint. `arbitrate.ts`'s own `uniqueCheckpointId` fails
 * closed (refuses to pick one, never guesses) when relevant participants
 * disagree — see that file's header for the full reasoning.
 */
export interface ArbitrationParticipant {
  readonly agentId: AgentId;
  readonly resourceId: ResourceId;
  readonly claimId: ResourceClaimId;
  readonly checkpointId?: CheckpointId;
}
