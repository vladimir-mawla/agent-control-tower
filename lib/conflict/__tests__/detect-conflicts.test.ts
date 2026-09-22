import { describe, expect, it } from "vitest";
import { detectConflicts } from "../detect-conflicts.js";
import { claim, heartbeat } from "./fixtures.js";

/**
 * Each `it` below names exactly which of plan §2's three `Conflict` kinds
 * (or which "what it refuses" bullet from plan §4 M3) it exercises, per
 * this milestone's own falsifiability discipline — a test that merely
 * asserts "no exception thrown" without checking the specific typed
 * result is exactly the vacuous-guard shape this account's own standing
 * note (a sibling's "guard whose assertions were both *implications*")
 * warns against, so every assertion below pins a concrete value, not
 * merely an absence of a crash.
 */
describe("detectConflicts — write-write", () => {
  it("two DIFFERENT agents both holding exclusive claims on the same resource is one write-write conflict naming both", () => {
    const result = detectConflicts(
      [claim("agent-a", "res-1", "exclusive"), claim("agent-b", "res-1", "exclusive")],
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe("write-write");
    expect(String(result.conflicts[0]?.resourceId)).toBe("res-1");
    expect(result.conflicts[0]?.agentIds.map(String)).toEqual(["agent-a", "agent-b"]);
  });

  it("mixed write + exclusive from two different agents still counts as write-write (plan: 'want exclusive/write on the same resource')", () => {
    const result = detectConflicts([claim("agent-a", "res-1", "write"), claim("agent-b", "res-1", "exclusive")], []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toEqual([expect.objectContaining({ kind: "write-write" })]);
  });

  it("a single agent's exclusive claim, alone, is not a conflict — a collision needs a SECOND party", () => {
    const result = detectConflicts([claim("agent-a", "res-1", "exclusive")], []);
    expect(result).toEqual({ ok: true, conflicts: [] });
  });

  it("the SAME agent holding two different (non-identical) write claims on one resource is not write-write against itself", () => {
    const result = detectConflicts(
      [claim("agent-a", "res-1", "write", { ttl: 1000 }), claim("agent-a", "res-1", "exclusive", { ttl: 2000 })],
      [],
    );
    expect(result).toEqual({ ok: true, conflicts: [] });
  });

  it("two different agents both reading is not a conflict of any kind", () => {
    const result = detectConflicts([claim("agent-a", "res-1", "read"), claim("agent-b", "res-1", "read")], []);
    expect(result).toEqual({ ok: true, conflicts: [] });
  });
});

describe("detectConflicts — write-read", () => {
  it("a writer and a different reader on the same resource is one write-read conflict naming both", () => {
    const result = detectConflicts([claim("agent-a", "res-1", "exclusive"), claim("agent-b", "res-1", "read")], []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe("write-read");
    expect(result.conflicts[0]?.agentIds.map(String)).toEqual(["agent-a", "agent-b"]);
  });

  it("an agent that both writes AND reads the same resource itself does not trigger write-read against itself alone", () => {
    const result = detectConflicts([claim("agent-a", "res-1", "write"), claim("agent-a", "res-1", "read")], []);
    expect(result).toEqual({ ok: true, conflicts: [] });
  });

  it("a writer, a self-reading writer, and a genuine third-party reader still reports write-read for the genuine reader", () => {
    const result = detectConflicts(
      [claim("agent-a", "res-1", "write"), claim("agent-a", "res-1", "read"), claim("agent-b", "res-1", "read")],
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe("write-read");
    expect(result.conflicts[0]?.agentIds.map(String)).toEqual(["agent-a", "agent-b"]);
  });

  it("write-write and write-read can both fire for the same resource when warranted (two writers, one outside reader)", () => {
    const result = detectConflicts(
      [claim("agent-a", "res-1", "exclusive"), claim("agent-b", "res-1", "write"), claim("agent-c", "res-1", "read")],
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const kinds = result.conflicts.map((c) => c.kind).sort();
    expect(kinds).toEqual(["write-read", "write-write"]);
  });
});

describe("detectConflicts — undeclared-access", () => {
  it("a heartbeat naming a resource the agent never claimed at all is undeclared-access, refusing to treat it as weaker than the other two kinds", () => {
    const result = detectConflicts([], [heartbeat("agent-a", "res-1")]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toEqual([
      expect.objectContaining({ kind: "undeclared-access", agentIds: [expect.anything()] }),
    ]);
    expect(result.conflicts[0]?.agentIds.map(String)).toEqual(["agent-a"]);
  });

  it("a heartbeat for a resource the SAME agent already claims (in ANY mode) is not undeclared-access", () => {
    for (const mode of ["read", "write", "exclusive"] as const) {
      const result = detectConflicts([claim("agent-a", "res-1", mode)], [heartbeat("agent-a", "res-1")]);
      expect(result).toEqual({ ok: true, conflicts: [] });
    }
  });

  it("a heartbeat for a resource a DIFFERENT agent claims is still undeclared-access for the heartbeating agent", () => {
    const result = detectConflicts([claim("agent-b", "res-1", "exclusive")], [heartbeat("agent-a", "res-1")]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const undeclared = result.conflicts.find((c) => c.kind === "undeclared-access");
    expect(undeclared?.agentIds.map(String)).toEqual(["agent-a"]);
  });

  it("50 identical repeated heartbeats for the same (agent, resource) is exactly ONE undeclared-access conflict, never 50", () => {
    const heartbeats = Array.from({ length: 50 }, () => heartbeat("agent-a", "res-1"));
    const result = detectConflicts([], heartbeats);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
  });
});

describe("detectConflicts — idempotence under duplicate claim re-declaration (plan §4 M3, verbatim refusal)", () => {
  it("an agent re-declaring the identical claim many times does not multiply the conflict it participates in", () => {
    const repeatedA = Array.from({ length: 25 }, () => claim("agent-a", "res-1", "exclusive"));
    const result = detectConflicts([...repeatedA, claim("agent-b", "res-1", "exclusive")], []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.agentIds.map(String)).toEqual(["agent-a", "agent-b"]);
  });
});

describe("detectConflicts — purity (no mutation of inputs)", () => {
  it("does not mutate the claims/heartbeats arrays or their elements", () => {
    const claims = [claim("agent-a", "res-1", "exclusive"), claim("agent-b", "res-1", "exclusive")];
    const heartbeats = [heartbeat("agent-c", "res-2")];
    const claimsSnapshot = JSON.parse(JSON.stringify(claims));
    const heartbeatsSnapshot = JSON.parse(JSON.stringify(heartbeats));
    detectConflicts(claims, heartbeats);
    expect(JSON.parse(JSON.stringify(claims))).toEqual(claimsSnapshot);
    expect(JSON.parse(JSON.stringify(heartbeats))).toEqual(heartbeatsSnapshot);
  });
});
