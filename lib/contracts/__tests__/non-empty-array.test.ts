import { describe, expect, it } from "vitest";
import type { NonEmptyArray } from "../non-empty-array.js";
import { isNonEmptyArray } from "../non-empty-array.js";

describe("NonEmptyArray<T> refuses an empty literal at the type level, not with a runtime length check", () => {
  it("a literal with at least one element is assignable", () => {
    const xs: NonEmptyArray<string> = ["a"];
    expect(xs).toEqual(["a"]);
  });

  it("TYPE-LEVEL: an empty literal is not assignable", () => {
    // @ts-expect-error — `[]` has no first element and is not assignable to `readonly [T, ...T[]]`.
    const xs: NonEmptyArray<string> = [];
    expect(xs).toBeDefined();
  });

  it("TYPE-LEVEL: a plain (non-tuple) array is not assignable even when it happens to be non-empty at runtime", () => {
    const raw: readonly string[] = ["a", "b"];
    // @ts-expect-error — a `readonly string[]` is not statically known to be non-empty, regardless of its actual runtime length; only the tuple shape itself satisfies NonEmptyArray.
    const xs: NonEmptyArray<string> = raw;
    expect(xs).toBeDefined();
  });
});

describe("isNonEmptyArray narrows a plain array without an unsafe cast", () => {
  it("returns true and narrows for a non-empty array", () => {
    const raw: readonly string[] = ["a"];
    expect(isNonEmptyArray(raw)).toBe(true);
    if (isNonEmptyArray(raw)) {
      // If this compiles, `raw` narrowed to NonEmptyArray<string> — `[0]` is
      // statically known to exist, not merely hoped for.
      expect(raw[0]).toBe("a");
    }
  });

  it("returns false for an empty array — a real runtime check, confined to this one function", () => {
    const raw: readonly string[] = [];
    expect(isNonEmptyArray(raw)).toBe(false);
  });
});
