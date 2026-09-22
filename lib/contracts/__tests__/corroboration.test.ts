import { describe, expect, it } from "vitest";
import type { Corroboration } from "../corroboration.js";
import { ALL_CORROBORATIONS } from "../corroboration.js";

describe("Corroboration is a closed 3-value enum, never free text", () => {
  it("accepts exactly the three named levels", () => {
    const a: Corroboration = "self-reported";
    const b: Corroboration = "cross-checked";
    const c: Corroboration = "independently-verified";
    expect([a, b, c]).toEqual(ALL_CORROBORATIONS);
  });

  it("TYPE-LEVEL: an invented fourth value does not compile", () => {
    // @ts-expect-error — Corroboration is closed to exactly the three named levels; a free-text value like "trusted" must not typecheck.
    const bogus: Corroboration = "trusted";
    expect(bogus).toBeDefined();
  });

  it("TYPE-LEVEL: an arbitrary string is not assignable, only the three literals", () => {
    const raw: string = "self-reported";
    // @ts-expect-error — a plain `string`, even one holding a legal value at runtime, is not statically narrowed to Corroboration; the closed union must be constructed from a literal or a real narrowing check, not assumed from `string`.
    const level: Corroboration = raw;
    expect(level).toBeDefined();
  });

  it("ALL_CORROBORATIONS enumerates exactly the three levels, pairwise distinct", () => {
    expect(ALL_CORROBORATIONS).toHaveLength(3);
    expect(new Set(ALL_CORROBORATIONS).size).toBe(3);
  });
});
