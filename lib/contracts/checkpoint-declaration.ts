import type { CheckpointId } from "./ids.js";
import type { Timestamp } from "./timestamp.js";

/**
 * `CheckpointDeclaration` — an agent's own claim that *now* is a safe
 * place to pause it (plan §2): `{ reachable, resumable, checkpointId,
 * declaredAt }`, exactly the four fields the plan names.
 *
 * **Refuses to be inferred by the tower** — only the agent that is
 * actually running can know its own safe-stop points; the tower may
 * distrust the claim (via `Corroboration`, corroboration.ts) but may
 * never fabricate one on the agent's behalf. This file enforces the
 * narrower, structural half of that refusal: there is no constructor here
 * that synthesizes a `CheckpointDeclaration` from anything else (no
 * `inferCheckpoint(claim: ResourceClaim): CheckpointDeclaration`-shaped
 * function exists in this milestone, and none should be added later
 * without revisiting this comment) — every `CheckpointDeclaration` value
 * a caller has is one an agent itself produced. The other half — the
 * tower actually acting on its own distrust of a self-reported checkpoint
 * — is M4's job (`lib/gate/**`, unbuilt): `pause` and `halt`/`checkpointed`
 * both require this checkpoint be `reachable` and fresher than a
 * configured staleness bound before either is even offered.
 *
 * NO `corroboration` FIELD, DELIBERATELY: see `resource-claim.ts`'s
 * header. `Corroboration` lives on `ResourceClaim`, and M4's own
 * signature (`availableInterventions(agent, claim, checkpoint, now)`)
 * takes both as separate arguments — corroboration is read from `claim`,
 * freshness from `checkpoint`. Duplicating a `corroboration` field onto
 * this type as well would invite the two to drift out of sync with no
 * single source of truth for which one a caller should trust.
 */
export interface CheckpointDeclaration {
  readonly reachable: boolean;
  readonly resumable: boolean;
  readonly checkpointId: CheckpointId;
  readonly declaredAt: Timestamp;
}
