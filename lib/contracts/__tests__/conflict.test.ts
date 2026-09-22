import { describe, expect, it } from "vitest";
import type { Conflict } from "../conflict.js";
import { ALL_CONFLICTS } from "../conflict.js";

describe("Conflict is a closed 3-value enum, never free text", () => {
  it("accepts exactly the three named kinds", () => {
    const a: Conflict = "write-write";
    const b: Conflict = "write-read";
    const c: Conflict = "undeclared-access";
    expect([a, b, c]).toEqual(ALL_CONFLICTS);
  });

  it("TYPE-LEVEL: an invented fourth kind does not compile", () => {
    // @ts-expect-error — Conflict is closed to exactly the three named kinds; a made-up kind like "read-read" must not typecheck.
    const bogus: Conflict = "read-read";
    expect(bogus).toBeDefined();
  });

  it("undeclared-access is a full member of the enum, not a lesser/optional case (plan §2: 'refuses to be treated as any weaker than the other two')", () => {
    expect(ALL_CONFLICTS).toContain("undeclared-access");
    // Structurally: undeclared-access is assignable everywhere the other two are, with no separate/weaker type.
    const kinds: readonly Conflict[] = ["write-write", "write-read", "undeclared-access"];
    expect(kinds.every((k) => ALL_CONFLICTS.includes(k))).toBe(true);
  });

  it("ALL_CONFLICTS enumerates exactly the three kinds, pairwise distinct", () => {
    expect(ALL_CONFLICTS).toHaveLength(3);
    expect(new Set(ALL_CONFLICTS).size).toBe(3);
  });
});
