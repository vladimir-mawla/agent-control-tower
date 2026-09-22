import {
  conflictId,
  resourceClaimId,
  isNonEmptyArray,
  assertValidHaltForced,
  type HaltForced,
  type HumanId,
  type ResourceClaimId,
} from "../../../lib/contracts/index";

/**
 * Force dynamic + Node.js runtime: without `dynamic = "force-dynamic"`,
 * Next.js may treat this route as statically renderable and serve a
 * prerendered response from build time forever after — at which point the
 * "live" contracts check below becomes theatre, run once at build and
 * never again, and the commit SHA below would freeze at whatever it was
 * during the build that produced the static output. `runtime = "nodejs"`
 * matches memory-ledger's own app/api/health/route.ts (M2 precedent this
 * file is adapted from) and is kept as explicit, self-documenting proof of
 * intent even though it is already Next 16.3+'s unconditional default for
 * route handlers.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ContractsCheckResult {
  readonly pass: boolean;
  readonly elapsedMs: number;
  readonly detail: string;
}

/**
 * Real work, not a liveness ping — adapted from memory-ledger's own
 * app/api/health/route.ts (that file exercises a real piece of ITS lib/ on
 * every request; this one does the same against what THIS project has
 * actually built). At M2, only lib/contracts/** (M1, frozen) exists —
 * lib/conflict (M3), lib/gate (M4), and lib/arbitrate (M5) do not, so this
 * check cannot — and must not pretend to — exercise them. Plan §4 (M2,
 * "what it refuses"): "to report 200 if the real contracts check fails
 * (must return 503)."
 *
 * `lib/contracts` (M1) has exactly two functions with real, falsifiable
 * branching logic — everything else in that milestone is a closed-union
 * type or an opaque id brand with no runtime behavior to check at all
 * (`Corroboration`, `Conflict`, `ConflictSeverity` are pure string unions;
 * `assertNeverIntervention` never runs on a value TypeScript itself
 * considers reachable). This check exercises both, each in BOTH directions
 * — a correct input that must pass and a corrupted input that must be
 * caught — the same "structural discrimination, not merely no exception"
 * discipline memory-ledger's own health check documents:
 *
 *   1. `assertValidHaltForced` on a well-formed `halt`/`forced` value
 *      (real, non-empty `authorizedBy`/`conflictId`) -> must report `ok:
 *      true`. `authorizedBy` here is supplied BY THIS CALLER, via an `as
 *      HumanId` cast — exactly the documented, expected way any code
 *      outside `lib/` must produce one, since `lib/contracts` deliberately
 *      exports no `HumanId` minting function (see `human-id.ts`'s header:
 *      "a genuine `HumanId` ... a signed-in operator's own session
 *      identity" is this app layer's job, not `lib/`'s). This route plays
 *      that caller role for its own self-test, the same way a real M8
 *      operator UI eventually would.
 *   2. `assertValidHaltForced` on a value that reached the `HaltForced`
 *      shape via an unsafe cast with `authorizedBy` DROPPED entirely (the
 *      exact bypass class the function's own header names as what it can
 *      and does catch) -> must report `ok: false` with `error.kind ===
 *      "missing-authorized-by"`. If a future edit ever made this function
 *      permissive — e.g. treating a missing field as "assume authorized"
 *      — this assertion fails immediately, because the cast here
 *      deliberately omits the field rather than merely leaving it falsy.
 *   3. `isNonEmptyArray` on an empty `ResourceClaimId[]` -> must report
 *      `false`. This is the runtime narrowing `quarantine`'s
 *      `revokedClaims: NonEmptyArray<ResourceClaimId>` field relies on
 *      whenever a caller builds the array from a filter/map instead of a
 *      literal; a regression here would let an empty quarantine claim to
 *      revoke something it revokes nothing.
 *   4. `isNonEmptyArray` on a one-element array -> must report `true`,
 *      so assertion 3 is a real discrimination, not a vacuous "always
 *      false" pass.
 *
 * WHAT WOULD MAKE THIS REPORT UNHEALTHY: any of the four assertions above
 * failing (a real regression in either function's logic), or the block
 * throwing at all (caught below, never allowed to escape past the
 * endpoint) — for example, if `assertValidHaltForced` were edited to check
 * only `conflictId` and stopped validating `authorizedBy`, assertion 2
 * would flip to `ok: true` and this check would fail, correctly, without
 * anyone needing to notice the gap by reading the diff.
 *
 * DELIBERATELY SCOPED TO lib/contracts ONLY, NOT WIDENED PAST IT: matching
 * memory-ledger's own precedent of keeping this endpoint pinned to what
 * existed at M2 rather than becoming a second, drifting copy of the test
 * suite as later milestones land. M3–M5 are unbuilt as of this milestone;
 * this comment does not promise this endpoint will grow to cover them —
 * only that it stays honest about what it covers today.
 */
function runContractsCheck(): ContractsCheckResult {
  const start = performance.now();
  try {
    const validHalt: HaltForced = {
      kind: "halt",
      mode: "forced",
      // See this function's own header: this cast is the caller's
      // responsibility, not lib/'s — the documented, expected route for
      // any code outside lib/contracts to produce a HumanId.
      authorizedBy: "health-check-operator" as HumanId,
      conflictId: conflictId("health-check-conflict"),
    };
    const validResult = assertValidHaltForced(validHalt);
    const validAccepted = validResult.ok === true;

    // Reached this shape via an unsafe cast that drops `authorizedBy`
    // entirely — a value the type system was bypassed to produce, exactly
    // the class `assertValidHaltForced` exists to catch at runtime.
    const invalidHalt = {
      kind: "halt",
      mode: "forced",
      conflictId: conflictId("health-check-conflict-2"),
    } as unknown as HaltForced;
    const invalidResult = assertValidHaltForced(invalidHalt);
    const invalidCaught = invalidResult.ok === false && invalidResult.error.kind === "missing-authorized-by";

    const emptyClaims: readonly ResourceClaimId[] = [];
    const oneClaim: readonly ResourceClaimId[] = [resourceClaimId("health-check-claim")];
    const emptyRejected = isNonEmptyArray(emptyClaims) === false;
    const nonEmptyAccepted = isNonEmptyArray(oneClaim) === true;

    const pass = validAccepted && invalidCaught && emptyRejected && nonEmptyAccepted;
    return {
      pass,
      elapsedMs: performance.now() - start,
      detail: pass
        ? "assertValidHaltForced: valid->ok, dropped-authorizedBy->rejected; isNonEmptyArray: empty->false, one-element->true"
        : `contracts check failed: validAccepted=${validAccepted} invalidCaught=${invalidCaught} emptyRejected=${emptyRejected} nonEmptyAccepted=${nonEmptyAccepted}`,
    };
  } catch (err) {
    return {
      pass: false,
      elapsedMs: performance.now() - start,
      detail: `contracts check threw: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export async function GET(): Promise<Response> {
  const contracts = runContractsCheck();

  const body = {
    status: contracts.pass ? "ok" : "degraded",
    // Set FOR us by Vercel on every deployment. Unset in local dev, where
    // the honest answer is "unknown," never a guessed or hardcoded SHA — a
    // health endpoint that fabricates its own provenance is worse than one
    // that admits it doesn't know (plan §4, M2: "to fabricate a commit SHA
    // when VERCEL_GIT_COMMIT_SHA is unset locally").
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown (local dev)",
    checks: {
      contracts: {
        pass: contracts.pass,
        elapsedMs: Math.round(contracts.elapsedMs * 1000) / 1000,
        detail: contracts.detail,
      },
    },
  };

  // Fail closed: a health endpoint that reports 200 while the one thing it
  // actually verified is broken is worse than no health endpoint at all.
  return Response.json(body, { status: contracts.pass ? 200 : 503 });
}
