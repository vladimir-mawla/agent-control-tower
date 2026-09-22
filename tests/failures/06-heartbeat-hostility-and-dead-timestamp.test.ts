import { describe, expect, it } from "vitest";
import { agentId, resourceId, timestamp } from "../../lib/contracts/index.js";
import { detectConflicts, type Heartbeat } from "../../lib/conflict/index.js";
import { buildClaim } from "./support.js";

/**
 * FAILURE CASE 6 — plan §5 sketch cases 6 AND 7, merged, because reading
 * `detect-conflicts.ts` directly shows they cannot be pinned separately as
 * written.
 *
 * SKETCH 6 ("hostile heartbeat payload... must produce a typed failure,
 * never a crash") — kept, and sharpened: `safeExtractHeartbeats` only ever
 * reads `heartbeat.agentId` and `heartbeat.resourceId` inside its `try`. A
 * throwing getter on THOSE two fields is caught, exactly as the plan
 * demands. A throwing getter (or a NaN value) on `heartbeat.at` is caught
 * by NOTHING — not because the defense is weak, but because `.at` is never
 * read by this function AT ALL. The sketch's own phrase "throwing
 * getter / Proxy / NaN timestamp" lumps three attacks together as if they
 * were defended against identically; this system defends against exactly
 * two of the three, and is simply indifferent to the third, which is a
 * different, sharper fact than "handles it safely."
 *
 * SKETCH 7 ("future-dated heartbeat... must fail closed to 'most stale'")
 * — THIS IS A PLAN DEFECT, not merely a case to reframe. `detectConflicts`
 * has no `now` parameter at all (unlike `availableInterventions`), and
 * `Heartbeat.at` is never compared to anything, ever (confirmed by reading
 * `detect-conflicts.ts` and `heartbeat.ts`'s own header directly: "even
 * though `detectConflicts` itself... does not compare `at` against
 * anything"). There is no staleness/freshness concept for a heartbeat
 * anywhere in this codebase to fail closed OR open — the sketch describes
 * a mechanism this system does not have. The closest REAL clock-skew
 * refusal that exists is `lib/gate/clock.ts`'s `isCheckpointFresh`, already
 * covered by case 2. This case replaces sketch 7 with the honest finding
 * instead of manufacturing a fake staleness check to make the sketch look
 * satisfied.
 *
 * WHAT WOULD MAKE THIS FAIL: `safeExtractHeartbeats` starting to read
 * `.at` (the third sub-test would then either throw or start returning
 * `ok: false`, and would need updating — that update is exactly the signal
 * this test exists to produce); or `detectConflicts` gaining a `now`
 * parameter or any comparison against `heartbeat.at` (the fourth sub-test
 * would then diverge between the past- and future-dated runs).
 */
describe("FAILURE CASE 6 — heartbeat hostility is caught on identity fields only; a heartbeat's own timestamp is inert data nothing ever reads", () => {
  it("a Proxy heartbeats array that throws on access is caught as a typed hostile-heartbeats-input failure, never an uncaught exception", () => {
    const hostileArray = new Proxy([] as readonly Heartbeat[], {
      get() {
        throw new Error("simulated hostile heartbeats array");
      },
    });
    const result = detectConflicts([buildClaim()], hostileArray);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("hostile-heartbeats-input");
  });

  it("a heartbeat with a throwing getter on agentId is caught the same way", () => {
    const hostileHeartbeat: Heartbeat = {
      get agentId(): never {
        throw new Error("simulated hostile agentId getter");
      },
      resourceId: resourceId("resource-1"),
      at: timestamp("2026-09-22T00:00:00.000Z"),
    };
    const result = detectConflicts([buildClaim()], [hostileHeartbeat]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("hostile-heartbeats-input");
    expect(result.error.message).toContain("simulated hostile agentId getter");
  });

  it("THE ACTUAL LIMIT: a throwing getter on `.at` specifically is NEVER invoked at all — no crash, but also no typed failure, because nothing reads that field", () => {
    let atWasEverRead = false;
    const hostileTimestampHeartbeat: Heartbeat = {
      agentId: agentId("agent-a"),
      resourceId: resourceId("resource-1"),
      get at(): never {
        atWasEverRead = true;
        throw new Error("this must never be reached");
      },
    };
    // No claim on file for (agent-a, resource-1) — this heartbeat would be
    // a legitimate undeclared-access trigger if `.at` were ever consulted.
    const result = detectConflicts([], [hostileTimestampHeartbeat]);
    expect(result.ok).toBe(true); // not caught — proving the field is simply never touched
    expect(atWasEverRead).toBe(false);
  });

  it("REPLACES SKETCH 7: a heartbeat dated far in the future and one dated normally in the past produce a BYTE-IDENTICAL detection result — no clock-skew handling exists for heartbeats anywhere in this system", () => {
    const pastDated: Heartbeat = { agentId: agentId("agent-a"), resourceId: resourceId("resource-1"), at: timestamp("2020-01-01T00:00:00.000Z") };
    const futureDated: Heartbeat = { agentId: agentId("agent-a"), resourceId: resourceId("resource-1"), at: timestamp("2099-01-01T00:00:00.000Z") };
    const withPast = detectConflicts([], [pastDated]);
    const withFuture = detectConflicts([], [futureDated]);
    expect(withPast).toEqual(withFuture);
  });
});
