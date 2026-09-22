import { describe, expect, it } from "vitest";
import { agentId, resourceId } from "../../contracts/ids.js";
import { deriveConflictId } from "../detected-conflict.js";

/**
 * `deriveConflictId` (`detected-conflict.ts`) is the mechanism
 * `detectConflicts`'s order-independence and idempotence proofs actually
 * rest on: a deterministic function of (kind, resourceId, sorted+deduped
 * participant agentIds), never of array position or call count. This file
 * tests that mechanism directly and in isolation, separate from
 * `detect-conflicts.test.ts`'s end-to-end behavior tests, plus pins the
 * one disclosed, accepted limit `detected-conflict.ts`'s own header names
 * (a separator collision for an adversarially-crafted id containing `|`)
 * as a real, passing assertion — not a silently-undiscovered gap.
 */
describe("deriveConflictId — determinism", () => {
  it("is identical regardless of the order agentIds are supplied in", () => {
    const forward = deriveConflictId("write-write", resourceId("res-1"), [agentId("agent-a"), agentId("agent-b")]);
    const backward = deriveConflictId("write-write", resourceId("res-1"), [agentId("agent-b"), agentId("agent-a")]);
    expect(String(forward)).toBe(String(backward));
  });

  it("is identical regardless of duplicate agentIds in the input", () => {
    const withDuplicates = deriveConflictId("write-write", resourceId("res-1"), [
      agentId("agent-a"),
      agentId("agent-a"),
      agentId("agent-b"),
    ]);
    const withoutDuplicates = deriveConflictId("write-write", resourceId("res-1"), [agentId("agent-a"), agentId("agent-b")]);
    expect(String(withDuplicates)).toBe(String(withoutDuplicates));
  });

  it("differs when kind differs, all else equal", () => {
    const writeWrite = deriveConflictId("write-write", resourceId("res-1"), [agentId("agent-a")]);
    const writeRead = deriveConflictId("write-read", resourceId("res-1"), [agentId("agent-a")]);
    expect(String(writeWrite)).not.toBe(String(writeRead));
  });

  it("differs when resourceId differs, all else equal", () => {
    const a = deriveConflictId("write-write", resourceId("res-1"), [agentId("agent-a")]);
    const b = deriveConflictId("write-write", resourceId("res-2"), [agentId("agent-a")]);
    expect(String(a)).not.toBe(String(b));
  });

  it("differs when the participant set differs, all else equal", () => {
    const a = deriveConflictId("write-write", resourceId("res-1"), [agentId("agent-a"), agentId("agent-b")]);
    const b = deriveConflictId("write-write", resourceId("res-1"), [agentId("agent-a"), agentId("agent-c")]);
    expect(String(a)).not.toBe(String(b));
  });

  it("DISCLOSED LIMIT (not a silently-rediscoverable gap): an id/resource string containing the '|' separator can collide with a differently-shaped conflict — pinned exactly as detected-conflict.ts's own header states", () => {
    // "write-write|R|a|R2" is produced two different ways:
    const viaAgentContainingSeparator = deriveConflictId("write-write", resourceId("R"), [agentId("a|R2")]);
    const viaResourceContainingSeparator = deriveConflictId("write-write", resourceId("R|a"), [agentId("R2")]);
    expect(String(viaAgentContainingSeparator)).toBe(String(viaResourceContainingSeparator));
  });
});
