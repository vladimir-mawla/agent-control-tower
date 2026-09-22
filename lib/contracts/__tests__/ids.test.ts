import { describe, expect, it } from "vitest";
import { agentId, resourceId, resourceClaimId, checkpointId, conflictId } from "../ids.js";
import type { AgentId, ConflictId } from "../ids.js";

describe("id brands mint from a raw string and stay usable as plain strings", () => {
  it("each minting function returns the raw value, tagged", () => {
    expect(agentId("a1")).toBe("a1");
    expect(resourceId("r1")).toBe("r1");
    expect(resourceClaimId("c1")).toBe("c1");
    expect(checkpointId("k1")).toBe("k1");
    expect(conflictId("f1")).toBe("f1");
  });
});

describe("distinct id brands are not assignable to each other, even though all five are strings at runtime", () => {
  it("TYPE-LEVEL: an AgentId is not assignable to a ConflictId parameter", () => {
    function takesConflictId(_id: ConflictId): void {
      return;
    }
    const a: AgentId = agentId("a1");
    // @ts-expect-error — AgentId and ConflictId are distinct brands; a value minted as one must not typecheck where the other is expected.
    takesConflictId(a);
    expect(a).toBe("a1");
  });
});
