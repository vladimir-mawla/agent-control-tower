import { describe, expect, it } from "vitest";
import type { ResourceClaim, ResourceClaimMode } from "../resource-claim.js";
import { agentId, resourceId } from "../ids.js";
import { timestamp } from "../timestamp.js";

const AGENT = agentId("agent-1");
const RESOURCE = resourceId("resource-1");
const DECLARED_AT = timestamp("2026-09-22T00:00:00.000Z");

describe("ResourceClaim.mode is a closed 3-value enum, never a free-text lock description", () => {
  it("accepts exactly the three named modes", () => {
    const read: ResourceClaimMode = "read";
    const write: ResourceClaimMode = "write";
    const exclusive: ResourceClaimMode = "exclusive";
    expect([read, write, exclusive]).toEqual(["read", "write", "exclusive"]);
  });

  it("TYPE-LEVEL: a free-text mode does not compile", () => {
    // @ts-expect-error — ResourceClaim.mode is closed to "read" | "write" | "exclusive"; a free-text description like "shared-lock" must not typecheck.
    const mode: ResourceClaimMode = "shared-lock";
    expect(mode).toBeDefined();
  });

  it("TYPE-LEVEL: a ResourceClaim literal with a free-text mode does not compile", () => {
    const claim: ResourceClaim = {
      agentId: AGENT,
      resourceId: RESOURCE,
      // @ts-expect-error — mode must be one of the three closed literals, not an arbitrary string.
      mode: "shared-lock",
      declaredAt: DECLARED_AT,
      ttl: 60_000,
      corroboration: "self-reported",
    };
    expect(claim).toBeDefined();
  });
});

describe("ResourceClaim requires all six named fields (plan §2's exact literal shape)", () => {
  it("compiles with all six fields present", () => {
    const claim: ResourceClaim = {
      agentId: AGENT,
      resourceId: RESOURCE,
      mode: "exclusive",
      declaredAt: DECLARED_AT,
      ttl: 30_000,
      corroboration: "cross-checked",
    };
    expect(claim.mode).toBe("exclusive");
  });

  it("TYPE-LEVEL: missing corroboration does not compile", () => {
    // @ts-expect-error — corroboration is a required field, not optional; a claim must always name how the tower knows about it.
    const claim: ResourceClaim = {
      agentId: AGENT,
      resourceId: RESOURCE,
      mode: "read",
      declaredAt: DECLARED_AT,
      ttl: 30_000,
    };
    expect(claim).toBeDefined();
  });

  it("TYPE-LEVEL: an agentId cannot be handed where a resourceId is expected — the two id brands are not interchangeable", () => {
    const claim: ResourceClaim = {
      agentId: AGENT,
      // @ts-expect-error — resourceId expects a ResourceId, not an AgentId; the two opaque brands must not be assignable to each other even though both are strings at runtime.
      resourceId: AGENT,
      mode: "read",
      declaredAt: DECLARED_AT,
      ttl: 30_000,
      corroboration: "self-reported",
    };
    expect(claim).toBeDefined();
  });
});
