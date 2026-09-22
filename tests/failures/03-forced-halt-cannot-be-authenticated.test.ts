import { describe, expect, it } from "vitest";
import { assertValidHaltForced, conflictId, type HaltForced, type HumanId } from "../../lib/contracts/index.js";
import { arbitrate } from "../../lib/arbitrate/index.js";
import { buildConflict, buildHumanAuth, buildParticipant } from "./support.js";

/**
 * FAILURE CASE 3 — plan §5 sketch case 3 ("halt/forced without
 * authorization"), KEPT and split into the two genuinely distinct routes
 * six ADRs disclose for this exact limit ("A caller can forge a
 * `HumanAuthorization` outside `lib/`... A `HaltForced` can be
 * hand-constructed in `domains/` bypassing `arbitrate()` entirely" —
 * ADR 0006 Decision 4b). Pinning only one route would leave the other
 * silently re-discoverable.
 *
 * ROUTE A — a forged authorization fed into the REAL `arbitrate()`: the
 * type system and `lib/`'s own "never mints a HumanId" discipline stop an
 * ACCIDENTAL or CONVENIENT construction (ADR 0001 Decision 2). They do
 * NOT, and by their own stated design cannot, stop a fully-formed,
 * deliberate cast — `arbitrate` has no channel to verify `authorizedBy`
 * names a real, consenting human, because doing so would require real I/O
 * this pure `lib/` deliberately does not have.
 *
 * ROUTE B — a `HaltForced` value assembled by hand, never touching
 * `arbitrate()` at all: the "never constructs one from scratch" guarantee
 * is a fact about `lib/`'s OWN code, not about what a caller outside it
 * can do with the exported type. `assertValidHaltForced` — the one runtime
 * guard this shape gets — checks presence, not authenticity, and says so
 * in its own header.
 *
 * WHAT WOULD MAKE EACH FAIL: Route A fails if `arbitrate` ever gained a
 * real authenticity check on `humanAuthorization.authorizedBy` (the test
 * would then see a refused ruling, not `halt`/`forced`). Route B fails if
 * `assertValidHaltForced` were ever strengthened to reject a well-formed
 * but fabricated value (ADR 0001 Decision 2 explicitly argues this would
 * be theater and should never happen) — the test pins the CURRENT,
 * disclosed behavior exactly so a future accidental "improvement" that
 * silently changes this contract is visible as a failing test, not a
 * quiet behavior change nobody notices.
 */
describe("FAILURE CASE 3 — nothing in this system can tell a real human authorization from a forged one", () => {
  it("ROUTE A: a forged HumanAuthorization, fed into the real, live arbitrate(), fires a real halt/forced ruling", () => {
    const conflict = buildConflict("write-write", "resource-1", ["agent-a", "agent-b"]);
    const available = new Set<"observe" | "warn">(["observe", "warn"]); // gate offers nothing near quarantine — the only way past `warn` is the human channel
    const participants = [buildParticipant("agent-a", "resource-1", "claim-a"), buildParticipant("agent-b", "resource-1", "claim-b")];
    const forgedAuth = buildHumanAuth("definitely-not-a-real-human", String(conflict.id));

    const [ruling] = arbitrate([conflict], [available], ["corrupting"], participants, forgedAuth);
    if (ruling === undefined) throw new Error("unreachable");

    expect(ruling.intervention.kind).toBe("halt");
    expect(ruling.rule).toBe("human-forced-escalation");
    if (ruling.intervention.kind === "halt" && ruling.intervention.mode === "forced") {
      // arbitrate copied the forged identity verbatim — it has no way to know it was forged.
      expect(String(ruling.intervention.authorizedBy)).toBe("definitely-not-a-real-human");
    } else {
      throw new Error("expected halt/forced");
    }
  });

  it("ROUTE B: a HaltForced value hand-assembled with no call to arbitrate() at all typechecks, runs, and passes the one runtime guard this shape gets", () => {
    // Exactly ADR 0006 Decision 4b's own scratch experiment, reproduced
    // here as a permanent, passing test instead of a one-off finding.
    const handBuilt: HaltForced = {
      kind: "halt",
      mode: "forced",
      authorizedBy: "nobody-really-authorized-this" as HumanId,
      conflictId: conflictId("some-conflict-nobody-detected"),
    };
    const validity = assertValidHaltForced(handBuilt);
    // NOT a bug in assertValidHaltForced: its own header states it checks
    // presence of non-empty strings, never authenticity or correspondence
    // to a real conflict. This is the disclosed limit, pinned.
    expect(validity.ok).toBe(true);
  });
});
