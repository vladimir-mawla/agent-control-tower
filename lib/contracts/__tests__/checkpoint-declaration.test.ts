import { describe, expect, it } from "vitest";
import type { CheckpointDeclaration } from "../checkpoint-declaration.js";
import { checkpointId } from "../ids.js";
import { timestamp } from "../timestamp.js";

const CHECKPOINT = checkpointId("checkpoint-1");
const DECLARED_AT = timestamp("2026-09-22T00:00:00.000Z");

describe("CheckpointDeclaration requires all four named fields (plan §2's exact literal shape)", () => {
  it("compiles with all four fields present", () => {
    const decl: CheckpointDeclaration = {
      reachable: true,
      resumable: true,
      checkpointId: CHECKPOINT,
      declaredAt: DECLARED_AT,
    };
    expect(decl.reachable).toBe(true);
  });

  it("TYPE-LEVEL: missing checkpointId does not compile", () => {
    // @ts-expect-error — checkpointId is required; a checkpoint declaration with no named checkpoint is not a declaration at all.
    const decl: CheckpointDeclaration = {
      reachable: true,
      resumable: true,
      declaredAt: DECLARED_AT,
    };
    expect(decl).toBeDefined();
  });

  it("TYPE-LEVEL: reachable cannot be a non-boolean 'maybe'", () => {
    const decl: CheckpointDeclaration = {
      // @ts-expect-error — reachable is a boolean, not a tri-state; the agent must commit to yes or no, never "unsure".
      reachable: "maybe",
      resumable: true,
      checkpointId: CHECKPOINT,
      declaredAt: DECLARED_AT,
    };
    expect(decl).toBeDefined();
  });

  it("TYPE-LEVEL: no corroboration field exists on CheckpointDeclaration — it is read from the paired ResourceClaim instead (see this file's own header)", () => {
    const decl: CheckpointDeclaration = {
      reachable: true,
      resumable: true,
      checkpointId: CHECKPOINT,
      declaredAt: DECLARED_AT,
      // @ts-expect-error — CheckpointDeclaration has no corroboration field; excess-property checking on the object literal must reject it.
      corroboration: "self-reported",
    };
    expect(decl).toBeDefined();
  });
});
