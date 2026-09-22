import { describe, expect, it } from "vitest";
import { detectConflicts } from "../detect-conflicts.js";
import type { ResourceClaim } from "../../contracts/resource-claim.js";
import type { Heartbeat } from "../heartbeat.js";
import { claim, heartbeat } from "./fixtures.js";

/**
 * Plan §4 M3, "what it refuses": "to crash on a hostile claims array
 * (throwing getter, `Proxy`)." Falsifiability check, verbatim: "a second
 * test feeds a `Proxy` that throws on property access and asserts a
 * typed failure result, never an uncaught exception." Every test below
 * asserts BOTH halves of that: (1) `detectConflicts` itself never throws
 * (`expect(() => ...).not.toThrow()`), and (2) the returned value is the
 * SPECIFIC typed failure (`ok: false`, a named `kind`), not merely
 * "some object came back" — the exact "implication, not a real
 * assertion" gap this milestone's own task warns a sibling shipped.
 *
 * Covers both named attack shapes (throwing getter; `Proxy`) against
 * BOTH inputs (`claims`; `heartbeats`), even though the plan's own prose
 * names only "a hostile claims array" — `detect-conflicts.ts`'s own
 * `safeExtractHeartbeats` uses the identical mechanism for the identical
 * reason, and this file proves that half too rather than leaving it
 * merely implied by symmetry with the claims-side tests.
 */

function throwingGetterClaim(): ResourceClaim {
  return {
    get agentId(): never {
      throw new Error("hostile getter: agentId");
    },
    resourceId: undefined as never,
    mode: undefined as never,
    declaredAt: undefined as never,
    ttl: undefined as never,
    corroboration: undefined as never,
  } as unknown as ResourceClaim;
}

function throwingGetterHeartbeat(): Heartbeat {
  return {
    agentId: undefined as never,
    get resourceId(): never {
      throw new Error("hostile getter: resourceId");
    },
    at: undefined as never,
  } as unknown as Heartbeat;
}

function throwingProxy<T extends object>(label: string): T {
  return new Proxy(
    {},
    {
      get(): never {
        throw new Error(`hostile Proxy trap: ${label}`);
      },
      has(): never {
        throw new Error(`hostile Proxy trap (has): ${label}`);
      },
      ownKeys(): never {
        throw new Error(`hostile Proxy trap (ownKeys): ${label}`);
      },
    },
  ) as unknown as T;
}

describe("detectConflicts — hostile claims input never crashes the process", () => {
  it("a Proxy claims array that throws on every property access returns a typed hostile-claims-input failure, not an uncaught exception", () => {
    const hostileClaims = throwingProxy<readonly ResourceClaim[]>("claims-array");
    let result: ReturnType<typeof detectConflicts> | undefined;
    expect(() => {
      result = detectConflicts(hostileClaims, []);
    }).not.toThrow();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: "hostile-claims-input" }) });
  });

  it("a single claim with a throwing getter for agentId, inside an otherwise ordinary array, returns the same typed failure", () => {
    const claims = [claim("agent-a", "res-1", "read"), throwingGetterClaim()];
    let result: ReturnType<typeof detectConflicts> | undefined;
    expect(() => {
      result = detectConflicts(claims, []);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result?.ok !== false) throw new Error("unreachable");
    expect(result.error.kind).toBe("hostile-claims-input");
    expect(result.error.message).toContain("hostile getter: agentId");
  });
});

describe("detectConflicts — hostile heartbeats input never crashes the process either", () => {
  it("a Proxy heartbeats array that throws on every property access returns a typed hostile-heartbeats-input failure", () => {
    const hostileHeartbeats = throwingProxy<readonly Heartbeat[]>("heartbeats-array");
    let result: ReturnType<typeof detectConflicts> | undefined;
    expect(() => {
      result = detectConflicts([], hostileHeartbeats);
    }).not.toThrow();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: "hostile-heartbeats-input" }) });
  });

  it("a single heartbeat with a throwing getter for resourceId returns the same typed failure, distinguished from the claims-side kind", () => {
    const heartbeats = [heartbeat("agent-a", "res-1"), throwingGetterHeartbeat()];
    let result: ReturnType<typeof detectConflicts> | undefined;
    expect(() => {
      result = detectConflicts([], heartbeats);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result?.ok !== false) throw new Error("unreachable");
    expect(result.error.kind).toBe("hostile-heartbeats-input");
    expect(result.error.message).toContain("hostile getter: resourceId");
  });

  it("valid claims combined with hostile heartbeats still reports hostile-heartbeats-input, not a silently-adequate partial success", () => {
    const claims = [claim("agent-a", "res-1", "exclusive"), claim("agent-b", "res-1", "exclusive")];
    const hostileHeartbeats = throwingProxy<readonly Heartbeat[]>("heartbeats-array");
    const result = detectConflicts(claims, hostileHeartbeats);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: "hostile-heartbeats-input" }) });
  });
});

describe("detectConflicts — hostile claims are checked before hostile heartbeats are ever read", () => {
  it("when BOTH inputs are hostile, the reported failure names the claims side (claims are validated first)", () => {
    const hostileClaims = throwingProxy<readonly ResourceClaim[]>("claims-array");
    const hostileHeartbeats = throwingProxy<readonly Heartbeat[]>("heartbeats-array");
    const result = detectConflicts(hostileClaims, hostileHeartbeats);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: "hostile-claims-input" }) });
  });
});
