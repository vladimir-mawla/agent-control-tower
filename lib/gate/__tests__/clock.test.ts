import { describe, expect, it } from "vitest";
import { timestamp } from "../../contracts/timestamp.js";
import { STALENESS_BOUND_MS, isCheckpointFresh } from "../clock.js";
import { buildCheckpoint } from "./fixtures.js";

const T0 = "2026-09-22T00:00:00.000Z";
const t0Plus = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();

describe("isCheckpointFresh — the boundary, exactly", () => {
  it("elapsed time exactly equal to STALENESS_BOUND_MS is still fresh (the boundary belongs to the permitted side)", () => {
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const now = timestamp(t0Plus(STALENESS_BOUND_MS));
    expect(isCheckpointFresh(checkpoint, now)).toBe(true);
  });

  it("elapsed time one millisecond past STALENESS_BOUND_MS is stale — the flip happens at exactly the configured bound, not near it", () => {
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const now = timestamp(t0Plus(STALENESS_BOUND_MS + 1));
    expect(isCheckpointFresh(checkpoint, now)).toBe(false);
  });

  it("elapsed time one millisecond BEFORE the bound is fresh (sanity: the boundary test above isn't accidentally always true)", () => {
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    const now = timestamp(t0Plus(STALENESS_BOUND_MS - 1));
    expect(isCheckpointFresh(checkpoint, now)).toBe(true);
  });

  it("elapsed time of zero (declaredAt === now) is fresh", () => {
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    expect(isCheckpointFresh(checkpoint, timestamp(T0))).toBe(true);
  });
});

describe("isCheckpointFresh — reachable: false is decisive on its own", () => {
  it("an otherwise-fresh but unreachable checkpoint is never fresh", () => {
    const checkpoint = buildCheckpoint({ reachable: false, declaredAt: T0 });
    expect(isCheckpointFresh(checkpoint, timestamp(T0))).toBe(false);
  });
});

describe("isCheckpointFresh — fails closed on every axis it cannot verify, never toward fresh", () => {
  it("an unparseable declaredAt cannot be ordered against now — treated as stale, not fresh", () => {
    const checkpoint = buildCheckpoint({ declaredAt: "definitely-not-a-date" });
    expect(isCheckpointFresh(checkpoint, timestamp(T0))).toBe(false);
  });

  it("an unparseable now cannot be ordered against declaredAt — treated as stale, not fresh", () => {
    const checkpoint = buildCheckpoint({ declaredAt: T0 });
    expect(isCheckpointFresh(checkpoint, timestamp("also-not-a-date"))).toBe(false);
  });

  it("a future-dated checkpoint (declaredAt after now — clock skew) fails closed to stale, never to 'most fresh' (mirrors plan §5's failure-suite case 7, re-derived here for a checkpoint)", () => {
    const checkpoint = buildCheckpoint({ declaredAt: t0Plus(1) });
    expect(isCheckpointFresh(checkpoint, timestamp(T0))).toBe(false);
  });
});

describe("STALENESS_BOUND_MS is a real, positive, exported policy value", () => {
  it("is a positive number tests can build exact fixtures against", () => {
    expect(STALENESS_BOUND_MS).toBeGreaterThan(0);
    expect(Number.isFinite(STALENESS_BOUND_MS)).toBe(true);
  });
});
