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
 * REVISION HISTORY (round 1 of this scan's evolution): the first version
 * of this guard matched the literal TEXT `` `as HumanId` `` and was
 * defeated, reported by independent verification, by exactly the aliasing
 * shape named two paragraphs up (`import type { HumanId as HID }`, cast
 * through `HID`) — the fix is the checker-based, symbol-identity scan
 * described above, not a smarter regex (see `.genesis/decisions/
 * 0001-contracts.md` Decision 2 for the full incident). That fix closes
 * the class "a CAST expression names `HumanId` as its target type,
 * however aliased, re-exported, or wrapped in parens/unions" — checked,
 * not assumed, against real aliasing and re-export fixtures in
 * `__tests__/human-id.test.ts` itself.
 *
 * THE HONEST LIMIT — STATED ONCE, AT ITS FULL STRENGTH, AFTER A SECOND
 * ROUND OF INDEPENDENT VERIFICATION REPORTED TWO MORE WORKING ROUTES:
 * every route found so far shares one shape — a cast expression (`as X` /
 * `<X>`) whose target type names `HumanId`. Independent verification then
 * reported two routes with NO such shape at all:
 *
 *   - Route A — no cast syntax anywhere: `function getRaw(): any { return
 *     "not-a-human"; } const x: HumanId = getRaw();`, or the equivalent
 *     `JSON.parse(...)` (both return `any`, and `any` is assignable to
 *     anything, including a branded type, with no assertion for a scanner
 *     to find).
 *   - Route B — a generic helper with the brand named only as a TYPE
 *     ARGUMENT at the call site: `function unsafeCast<T>(x: unknown): T {
 *     return x as T; } const x: HumanId = unsafeCast<HumanId>("not-a-
 *     human");` — the cast inside `unsafeCast` targets the type parameter
 *     `T`, never `HumanId` by name; `HumanId` appears only where
 *     `unsafeCast` is called, as a type argument this scan's
 *     `findHumanIdReferenceIn` never visits (it walks a cast's OWN target
 *     type node, not every type argument at every call site in the file).
 *
 * These are not two more cases to add detection for. They are two
 * examples of a class that is NOT ENUMERABLE, because TypeScript is
 * deliberately unsound by design: `any` exists specifically to opt out of
 * checking, a generic instantiated at its call site needs no value-level
 * assertion at all, and beyond A and B the same class already includes
 * `Object.assign`, declaration merging, a `@ts-ignore`/`@ts-expect-error`
 * hiding a real assignment, and whatever a future verifier invents next.
 * A scanner that closes today's known routes and claims completeness is
 * making a claim about an open-ended set — this project tried exactly
 * that once already (round 1 above) and is not repeating it: NO SCAN OF
 * THIS SHAPE CAN EVER BE COMPLETE, and this file does not claim otherwise
 * anywhere. See `intervention.ts`'s own header for why this project does
 * NOT rest `halt`/`forced`'s actual safety on "nobody can forge a
 * `HumanId`" at all — that claim is unenforceable in this language by
 * construction — and relies instead on a narrower, checkable property of
 * code this project actually controls.
 *
 * What this scan IS still worth keeping for, given the above: it is real,
 * checked evidence against the specific, plausible failure mode of an
 * engineer reaching for a visible `as`/`<T>` cast naming this brand,
 * directly or through an ordinary import alias or re-export — not a
 * complete defense, one piece of evidence among several. Where a genuine
 * `HumanId` actually comes from at runtime — a signed-in operator's own
 * session identity, checked at whatever real human-facing boundary M8's
 * demo eventually builds — is deliberately undecided by this milestone;
 * inventing that boundary now, with no consumer yet, would be exactly the
 * unrequested flexibility this account's own standing note warns against.
 */
declare const humanIdBrand: unique symbol;
export type HumanId = string & { readonly [humanIdBrand]: "HumanId" };
