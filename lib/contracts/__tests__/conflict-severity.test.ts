import { describe, expect, it } from "vitest";
import type { ConflictSeverity } from "../conflict-severity.js";
import { ALL_CONFLICT_SEVERITIES } from "../conflict-severity.js";

describe("ConflictSeverity is a closed 3-value named enum, never a numeric score", () => {
  it("accepts exactly the three named severities", () => {
    const a: ConflictSeverity = "benign";
    const b: ConflictSeverity = "contained";
    const c: ConflictSeverity = "corrupting";
    expect([a, b, c]).toEqual(ALL_CONFLICT_SEVERITIES);
  });

  it("TYPE-LEVEL: a numeric severity does not compile", () => {
    // @ts-expect-error — ConflictSeverity is a closed string union, never a 0-1 score; a bare number must not typecheck as a severity.
    const bogus: ConflictSeverity = 0.73;
    expect(bogus).toBeDefined();
  });

  it("TYPE-LEVEL: an invented fourth severity does not compile", () => {
    // @ts-expect-error — ConflictSeverity is closed to exactly three named values; "critical" is not one of them.
    const bogus: ConflictSeverity = "critical";
    expect(bogus).toBeDefined();
  });

  it("ALL_CONFLICT_SEVERITIES enumerates exactly the three severities, pairwise distinct", () => {
    expect(ALL_CONFLICT_SEVERITIES).toHaveLength(3);
    expect(new Set(ALL_CONFLICT_SEVERITIES).size).toBe(3);
  });
});
