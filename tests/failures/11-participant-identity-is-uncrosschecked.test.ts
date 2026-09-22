import { describe, expect, it } from "vitest";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { buildConflict, buildParticipant } from "./support.js";

/**
 * FAILURE CASE 11 — a limit implied, but never demonstrated, by ADR 0005
 * Decision 1: `ArbitrationParticipant` is "a new, M5-owned wrapper
 * correlating a conflict's participants to the two concrete ids
 * `arbitrate` needs" — but `arbitrate`'s own signature
 * (`lib/arbitrate/arbitrate.ts`) never receives a real `ResourceClaim` or
 * `CheckpointDeclaration` at all, only `DetectedConflict`,
 * `AvailableInterventionSet`, `ConflictSeverity`, and
 * `ArbitrationParticipant`. There is therefore NO code path anywhere in
 * this pipeline that can check whether a participant's `claimId` or
 * `checkpointId` corresponds to anything that was ever actually declared.
 * `ResourceClaim` still carries no `id` field of its own (ADR 0001
 * Decision 3, never closed for `ResourceClaim` itself — only worked
 * around by this wrapper), so there is nothing to cross-reference even in
 * principle without changing a frozen contract.
 *
 * THE LIMIT, STATED PLAINLY: `arbitrate` trusts `participants` completely,
 * on the caller's say-so alone. A `claimId`/`checkpointId` that names
 * nothing real produces an `Intervention` that cites that fabricated id as
 * confidently as it would cite a genuine one — the resulting ruling is
 * indistinguishable from a correct one by inspecting the ruling alone.
 *
 * WHAT WOULD MAKE THIS FAIL: `arbitrate` gaining a `claims`/`checkpoints`
 * parameter to cross-check `participants` against (the fabricated-id
 * fixtures below would then need to be rejected, not honored) — this
 * would be exactly the "arbitrate needs a claims parameter" cost ADR 0004
 * Decision 3 already predicted M5 would have to budget for, and which M5
 * chose the narrower `ArbitrationParticipant` route specifically to avoid
 * paying (ADR 0005 Decision 1).
 */
describe("FAILURE CASE 11 — arbitrate cannot verify a participant's claimId or checkpointId correspond to anything real", () => {
  it("a completely fabricated checkpointId, naming a checkpoint nobody ever declared, is cited in the final Intervention with full confidence", () => {
    const conflict = buildConflict("undeclared-access", "resource-1", ["agent-a"]);
    const available = new Set<"observe" | "warn" | "pause">(["observe", "warn", "pause"]);
    const fabricated = buildParticipant("agent-a", "resource-1", "claim-a", { checkpoint: "checkpoint-nobody-ever-declared" });

    const [ruling] = arbitrate([conflict], [available], ["contained"], [fabricated]);
    if (ruling === undefined || ruling.intervention.kind !== "pause") throw new Error("expected a pause ruling");
    expect(String(ruling.intervention.checkpointId)).toBe("checkpoint-nobody-ever-declared");
  });

  it("a completely fabricated claimId, naming a claim nobody ever made, is cited in a quarantine's revokedClaims with the same confidence as a real one", () => {
    const conflict = buildConflict("undeclared-access", "resource-1", ["agent-a"]);
    const available = new Set<"observe" | "warn" | "quarantine">(["observe", "warn", "quarantine"]);
    const fabricated = buildParticipant("agent-a", "resource-1", "claim-that-was-never-actually-declared");

    const [ruling] = arbitrate([conflict], [available], ["corrupting"], [fabricated]);
    if (ruling === undefined || ruling.intervention.kind !== "quarantine") throw new Error("expected a quarantine ruling");
    expect(ruling.intervention.revokedClaims.map(String)).toEqual(["claim-that-was-never-actually-declared"]);
  });
});
