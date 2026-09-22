import { describe, expect, it } from "vitest";
import { timestamp } from "../timestamp.js";
import type { Timestamp } from "../timestamp.js";

describe("Timestamp mints freely from any string, unlike memory-ledger's CapturedAt", () => {
  it("mints an ordinary past instant", () => {
    expect(timestamp("2020-01-01T00:00:00.000Z")).toBe("2020-01-01T00:00:00.000Z");
  });

  it("also mints a future-dated instant without rejecting it — deliberately, per this file's own header", () => {
    // Plan §5's failure-suite case 7 needs a future-dated heartbeat to be
    // constructible at all, so M3's (unbuilt) detection logic has a real
    // value to fail closed on. If Timestamp rejected this the way
    // memory-ledger's CapturedAt does, this line itself would throw.
    const farFuture = timestamp("2999-01-01T00:00:00.000Z");
    expect(farFuture).toBe("2999-01-01T00:00:00.000Z");
  });

  it("does not validate ISO-8601 shape either — a deliberately narrow brand, not a parser", () => {
    // No parseTimestamp exists in this milestone (see the file header for
    // why); the mint function is the identity function, tagged.
    const notAnInstant = timestamp("definitely-not-a-date");
    expect(notAnInstant).toBe("definitely-not-a-date");
  });

  it("TYPE-LEVEL: an un-minted plain string cannot be handed where a Timestamp is expected", () => {
    function takesTimestamp(t: Timestamp): Timestamp {
      return t;
    }
    expect(takesTimestamp(timestamp("2020-01-01T00:00:00.000Z"))).toBe("2020-01-01T00:00:00.000Z");
    // @ts-expect-error — a plain string literal, even a well-formed one, is not a Timestamp until minted via timestamp(); the brand must not be satisfied structurally.
    takesTimestamp("2020-01-01T00:00:00.000Z");
  });
});
