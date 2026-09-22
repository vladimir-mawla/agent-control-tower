import { describe, expect, it } from "vitest";
import { detectConflicts } from "../../lib/conflict/index.js";
import { buildClaim, buildHeartbeat } from "./support.js";

/**
 * FAILURE CASE 8 — plan §5 sketch case 9 ("agent silence... its last known
 * claim must still be treated as held, never released"), kept and
 * sharpened after reading `detect-conflicts.ts` directly: the sketch's own
 * framing implies the system makes a CHOICE to treat silence as
 * "held, not released." It does not — it has no mechanism to represent
 * silence, expiry, or release at all. `detectConflicts` has no `now`
 * parameter, never reads `ttl`, and reads no heartbeat AT ALL when
 * deciding whether an existing claim still counts (`ttl`'s own header,
 * `resource-claim.ts`, and ADR 0003 Decision 4 both state this plainly).
 * "A claim is held" means, in this system, exactly and only "a caller
 * chose to include it in the array passed to `detectConflicts` this
 * time" — nothing more.
 *
 * THE REAL LIMIT: this is not "the system correctly refuses to treat
 * silence as release" — it is "the system has no opinion on the question
 * at all, and will do whatever the caller's own claim-tracking decides,
 * right or wrong, with zero warning either way." A caller that WRONGLY
 * drops a silent agent's claim (exactly the failure plan §5's sketch warns
 * against) gets no refusal, no flag, nothing — `detectConflicts` cannot
 * tell "the agent released its claim" from "a caller's own bookkeeping
 * quietly forgot about a silent agent."
 *
 * WHAT WOULD MAKE THIS FAIL: `detectConflicts` gaining a `now`/`ttl`
 * comparison that expires a claim on its own (sub-test 1 would then see
 * the "long expired" claim excluded); or gaining any signal that flags a
 * caller-side removal as suspicious (sub-test 2 would then need to inspect
 * that signal instead of observing silent, unflagged disappearance).
 */
describe("FAILURE CASE 8 — nothing in this system can tell a released claim apart from a silently forgotten one", () => {
  it("ttl is completely inert for detection: a claim declared with a 1-millisecond ttl still participates in a conflict exactly like a claim with an hour-long one — there is no `now` for it to have expired against", () => {
    const barelyAliveClaim = buildClaim({ agent: "agent-a", ttl: 1 });
    const normalClaim = buildClaim({ agent: "agent-b", ttl: 3_600_000 });
    const withShortTtl = detectConflicts([barelyAliveClaim, buildClaim({ agent: "agent-b", ttl: 1 })], []);
    const withLongTtl = detectConflicts([barelyAliveClaim, normalClaim], []);
    expect(withShortTtl).toEqual(withLongTtl); // ttl value never changes the outcome at all
  });

  it("THE ACTUAL LIMIT: silently dropping a silent agent's claim from the array — exactly the mistake plan §5 warns against making — produces NO refusal, NO warning, and a conflict that simply, quietly disappears", () => {
    const bothStillClaiming = detectConflicts([buildClaim({ agent: "agent-a" }), buildClaim({ agent: "agent-b" })], []);
    expect(bothStillClaiming.ok).toBe(true);
    if (!bothStillClaiming.ok) throw new Error("unreachable");
    expect(bothStillClaiming.conflicts).toHaveLength(1);

    // A caller decides agent-a "went silent" and stops including its claim.
    // detectConflicts has no way to know this is a caller mistake rather
    // than a legitimate release — it just answers the (now differently
    // shaped) question it was asked, with nothing flagging the change.
    const afterDroppingSilentAgent = detectConflicts([buildClaim({ agent: "agent-b" })], []);
    expect(afterDroppingSilentAgent.ok).toBe(true);
    if (!afterDroppingSilentAgent.ok) throw new Error("unreachable");
    expect(afterDroppingSilentAgent.conflicts).toHaveLength(0); // the conflict is simply gone — silently
  });

  it("a heartbeat's ABSENCE carries no meaning anywhere in this system either — only a heartbeat's PRESENCE on an unclaimed resource does anything (undeclared-access); silence itself triggers nothing, protective or otherwise", () => {
    const claims = [buildClaim({ agent: "agent-a", resource: "resource-1" }), buildClaim({ agent: "agent-b", resource: "resource-1" })];
    const withNoHeartbeatsAtAll = detectConflicts(claims, []);
    const withHeartbeatsForBoth = detectConflicts(claims, [
      buildHeartbeat({ agent: "agent-a", resource: "resource-1" }),
      buildHeartbeat({ agent: "agent-b", resource: "resource-1" }),
    ]);
    // Heartbeats only ever ADD undeclared-access conflicts for an
    // UNCLAIMED (agent, resource) pair; they never subtract from, confirm,
    // or otherwise influence a write-write/write-read conflict already
    // established by claims alone.
    expect(withNoHeartbeatsAtAll).toEqual(withHeartbeatsForBoth);
  });
});
