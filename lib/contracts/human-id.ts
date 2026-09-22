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
 * `__tests__/human-id.test.ts`, which uses the REAL TypeScript type
 * checker (`typescript/unstable/sync`'s `API`/`Project`/`Checker`) to
 * resolve every `as`/`<T>` cast in every non-test file under `lib/` back
 * to the ORIGINAL symbol its target type refers to, and fails the build
 * if that original symbol is this file's own `HumanId` declaration —
 * regardless of what LOCAL name a cast writes (`import type { HumanId as
 * HID }` and casting through `HID` is resolved back to this same
 * declaration, not missed the way an earlier, text-based version of that
 * test was — see this file's own "REVISION HISTORY" paragraph below).
 * There is no excluded "defining file" the way `decision-engine`'s own
 * `brand-casts.test.ts` excludes `confidence.ts` (that file legitimately
 * casts once, inside its own parser) — no file in this codebase is
 * allowed to fabricate a `HumanId`, by design. Test fixtures are the sole
 * exception (a test asserting a literal string directly into this brand,
 * to build a sample `Intervention`, is not the "engine minted its own
 * authorization" failure mode this test exists to catch), matching the
 * same test-file exemption `brand-casts.test.ts` documents for
 * `Confidence`/`CostOfBeingWrong`.
 *
 * REVISION HISTORY, AND THE HONEST LIMIT THIS FILE STATES ONCE HERE AND
 * DOES NOT RESTATE MORE STRONGLY ELSEWHERE: the first version of this
 * guard matched the literal TEXT `` `as HumanId` `` and was defeated,
 * reported by independent verification, by exactly the aliasing shape
 * named two paragraphs up (`import type { HumanId as HID }`, cast through
 * `HID`) — the fix is the checker-based, symbol-identity scan described
 * above, not a smarter regex (see `.genesis/decisions/0001-contracts.md`
 * Decision 2 for the full incident). That fix closes the class "a cast
 * names `HumanId` as a type, however aliased, re-exported, or wrapped in
 * parens/unions" — checked, not assumed, against real aliasing and
 * re-export fixtures in `__tests__/human-id.test.ts` itself. It does NOT,
 * and NO scan targeting this brand specifically ever could, close a
 * DIFFERENT bypass independent verification reported separately: casting
 * an entire `HaltForced`/`Intervention` object literal `as unknown as`
 * the OUTER type, with `authorizedBy` a plain, never-branded string the
 * whole way through — that cast never names `HumanId` at all, so no
 * check keyed on this brand's identity has anything to find. See
 * `intervention.ts`'s own header for the claim stated at its true,
 * verified strength, and `assertValidHaltForced`'s own doc comment there
 * for the narrower, honest scope of the one runtime check this project
 * has for that remaining, disclosed gap. Separately: this scan cannot
 * stop a determined author from renaming this brand, editing this file,
 * or minting a value via `JSON.parse` into an untyped `any` and handing
 * it across a module boundary the checker cannot see. Where a genuine
 * `HumanId` actually comes from at runtime — a signed-in operator's own
 * session identity, checked at whatever real human-facing boundary M8's
 * demo eventually builds — is deliberately undecided by this milestone;
 * inventing that boundary now, with no consumer yet, would be exactly the
 * unrequested flexibility this account's own standing note warns against.
 */
declare const humanIdBrand: unique symbol;
export type HumanId = string & { readonly [humanIdBrand]: "HumanId" };
