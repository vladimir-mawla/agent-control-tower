/**
 * `HumanId` — a branded identity, deliberately WITHOUT a minting function,
 * unlike every other id brand in this directory (`ids.ts`).
 *
 * Every other id here (`AgentId`, `ResourceId`, `ResourceClaimId`,
 * `CheckpointId`, `ConflictId`) is a pure identity token: minting one
 * freely, from any raw string, costs nothing because nothing downstream
 * treats "I have one of these" as evidence of anything beyond "this names
 * a particular agent/resource/claim/checkpoint/conflict." `HumanId` is not
 * that. It is the one value `Intervention`'s `halt`/`forced` variant
 * (intervention.ts) requires as `authorizedBy` — the plan's central design
 * commitment (`.genesis/PLAN.md` §2, §4 M1) is that this variant "refuses
 * to compile without `authorizedBy: HumanId` ... No engine milestone (M3,
 * M4, or M5) may construct this variant on its own initiative."
 *
 * A required field alone does not enforce that: if this file exported a
 * `humanId(raw: string): HumanId` the same shape as `agentId()` in
 * `ids.ts`, any later milestone's engine code could write
 * `humanId("approved")` and satisfy the type checker with zero actual
 * human involvement — the exact "trust the self-report" failure this
 * whole project exists to refuse, just moved one level down into the id
 * brand instead of the intervention itself. So this brand is minted
 * nowhere in `lib/contracts` (or anywhere else under `lib/`) — see
 * `__tests__/human-id.test.ts`, which greps every non-test file under
 * `lib/` for a type-assertion cast to this brand and fails the build if
 * one appears anywhere. That test has no excluded "defining file" the way
 * `decision-engine`'s own `brand-casts.test.ts` excludes `confidence.ts`
 * (that file legitimately casts once, inside its own parser) — there is
 * no file in this codebase that is allowed to fabricate a `HumanId`, by
 * design. Test fixtures are the sole exception (a test asserting a literal
 * string directly into this brand, to build a sample `Intervention`, is
 * not the "engine minted its own authorization" failure mode this test
 * exists to catch), matching the same test-file exemption
 * `brand-casts.test.ts` documents for `Confidence`/`CostOfBeingWrong`.
 *
 * Honest limit, stated once here and not restated more strongly elsewhere:
 * this is a static, greppable guarantee, not a cryptographic one. It stops
 * that cast from appearing in this repository's own `lib/` source; it
 * cannot stop a determined author from renaming the brand, editing this
 * file, or minting one via `JSON.parse` into an untyped `any` and handing
 * it across a module boundary the scan doesn't see. Where a genuine
 * `HumanId` actually comes from at runtime — a signed-in operator's own
 * session identity, checked at whatever real human-facing boundary M8's
 * demo eventually builds — is deliberately undecided by this milestone;
 * inventing that boundary now, with no consumer yet, would be exactly the
 * unrequested flexibility this account's own standing note warns against.
 */
declare const humanIdBrand: unique symbol;
export type HumanId = string & { readonly [humanIdBrand]: "HumanId" };
