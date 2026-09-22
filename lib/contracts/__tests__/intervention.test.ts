import { describe, expect, it } from "vitest";
import type { Intervention, HaltForced } from "../intervention.js";
import { assertNeverIntervention, assertValidHaltForced } from "../intervention.js";
import { checkpointId, conflictId, resourceClaimId } from "../ids.js";
import type { HumanId } from "../human-id.js";

// Test fixtures only: constructing a HumanId directly via cast is the one
// exemption `human-id.ts`'s own architecture test documents — see
// `__tests__/human-id.test.ts`.
const ALICE = "alice" as HumanId;
const SOME_CONFLICT = conflictId("conflict-1");
const SOME_CHECKPOINT = checkpointId("checkpoint-1");

describe("Intervention.halt/forced is structurally uncompilable without a per-conflict human authorization", () => {
  it("compiles when both authorizedBy and conflictId are present", () => {
    const forced: Intervention = {
      kind: "halt",
      mode: "forced",
      authorizedBy: ALICE,
      conflictId: SOME_CONFLICT,
    };
    expect(forced.kind).toBe("halt");
  });

  it("TYPE-LEVEL: halt/forced missing authorizedBy does not compile", () => {
    // @ts-expect-error — `authorizedBy: HumanId` is required on the "forced" halt mode; omitting it must fail to compile (plan §4, M1's central refusal).
    const forced: Intervention = {
      kind: "halt",
      mode: "forced",
      conflictId: SOME_CONFLICT,
    };
    expect(forced).toBeDefined();
  });

  it("TYPE-LEVEL: halt/forced missing conflictId does not compile", () => {
    // @ts-expect-error — `conflictId: ConflictId` is required on the "forced" halt mode; a human authorization must be bound to a specific conflict.
    const forced: Intervention = {
      kind: "halt",
      mode: "forced",
      authorizedBy: ALICE,
    };
    expect(forced).toBeDefined();
  });

  it("TYPE-LEVEL: halt/forced missing both authorizedBy and conflictId does not compile", () => {
    // @ts-expect-error — both fields are required together; the bare { kind: "halt", mode: "forced" } shape must not typecheck on its own.
    const forced: Intervention = { kind: "halt", mode: "forced" };
    expect(forced).toBeDefined();
  });
});

describe("Intervention.pause and halt/checkpointed both require checkpointId", () => {
  it("compiles when checkpointId is present", () => {
    const pause: Intervention = { kind: "pause", checkpointId: SOME_CHECKPOINT };
    const checkpointed: Intervention = { kind: "halt", mode: "checkpointed", checkpointId: SOME_CHECKPOINT };
    expect(pause.kind).toBe("pause");
    expect(checkpointed.kind).toBe("halt");
  });

  it("TYPE-LEVEL: pause missing checkpointId does not compile", () => {
    // @ts-expect-error — `checkpointId` is required on "pause"; a pause with no named safe-stop point must not typecheck.
    const pause: Intervention = { kind: "pause" };
    expect(pause).toBeDefined();
  });

  it("TYPE-LEVEL: halt/checkpointed missing checkpointId does not compile", () => {
    // @ts-expect-error — `checkpointId` is required on the "checkpointed" halt mode, the same as "pause".
    const checkpointed: Intervention = { kind: "halt", mode: "checkpointed" };
    expect(checkpointed).toBeDefined();
  });
});

describe("Intervention.warn carries only a message — no execution-shaped field, by construction", () => {
  it("compiles with just a message", () => {
    const warn: Intervention = { kind: "warn", message: "two agents are contending for the same lock" };
    expect(warn.kind).toBe("warn");
  });

  it("TYPE-LEVEL: warn cannot carry a checkpointId — that would let it touch agent state", () => {
    const warn: Intervention = {
      kind: "warn",
      message: "hi",
      // @ts-expect-error — "warn" has no checkpointId field; excess-property checking on an object literal must reject it.
      checkpointId: SOME_CHECKPOINT,
    };
    expect(warn).toBeDefined();
  });
});

describe("Intervention.observe carries no data at all", () => {
  it("compiles as a bare kind", () => {
    const observe: Intervention = { kind: "observe" };
    expect(observe.kind).toBe("observe");
  });

  it("TYPE-LEVEL: observe cannot carry a message or any other field", () => {
    const observe: Intervention = {
      kind: "observe",
      // @ts-expect-error — "observe" carries no data; it structurally cannot justify or record an action it didn't take.
      message: "should not be allowed",
    };
    expect(observe).toBeDefined();
  });
});

describe("Intervention.quarantine requires a NON-EMPTY revokedClaims — a type, not a runtime length check", () => {
  it("compiles with at least one revoked claim", () => {
    const quarantine: Intervention = {
      kind: "quarantine",
      revokedClaims: [resourceClaimId("claim-1")],
    };
    expect(quarantine.kind).toBe("quarantine");
  });

  it("TYPE-LEVEL: an empty revokedClaims array does not compile", () => {
    // @ts-expect-error — revokedClaims is NonEmptyArray<ResourceClaimId> (readonly [T, ...T[]]); `[]` has no first element and is not assignable to it.
    const quarantine: Intervention = { kind: "quarantine", revokedClaims: [] };
    expect(quarantine).toBeDefined();
  });

  it("TYPE-LEVEL: revokedClaims cannot be a plain possibly-empty ResourceClaimId[] either", () => {
    const claims: ReturnType<typeof resourceClaimId>[] = [resourceClaimId("claim-1")];
    // @ts-expect-error — a plain (non-tuple) array, even a non-empty one at runtime, is not statically known to be non-empty; NonEmptyArray demands the tuple shape, not just "happens to have length > 0 right now".
    const quarantine: Intervention = { kind: "quarantine", revokedClaims: claims };
    expect(quarantine).toBeDefined();
  });
});

describe("Intervention is exhaustively matched — a real switch, proven live with a stand-in type", () => {
  /**
   * Falsifiability check named directly in the plan (§4, M1): "An
   * independent verifier adds a 6th top-level Intervention variant and
   * confirms every existing assertNeverIntervention call site fails to
   * compile until updated." `Intervention` itself must stay frozen at five
   * kinds for this milestone (widening the real type would violate the
   * freeze boundary this file's own module comment states), so — matching
   * shadow-run's `reconciliation.test.ts` and memory-ledger's
   * `belief-answer.test.ts`, which document making the identical choice —
   * this test demonstrates the mechanism on a LOCAL stand-in union that
   * mirrors `Intervention`'s shape plus one invented 6th kind.
   *
   * WHAT WAS ACTUALLY BROKEN AND RESTORED TO PROVE THIS TEST IS REAL (see
   * this milestone's PR report for the full falsifiability narrative): the
   * `default` branch below was temporarily changed from
   * `assertNeverStandIn(value)` to `return "unhandled"` — with that
   * change, the switch below still compiles (nothing forces every case to
   * be listed), silently swallowing the new "reassign" kind. Restoring
   * `assertNeverStandIn(value)` in the default branch is what makes
   * omitting a case for "reassign" a compile error again — that line is
   * the actual guard, not the switch's cases.
   */
  type StandInIntervention =
    | { readonly kind: "observe" }
    | { readonly kind: "warn"; readonly message: string }
    | { readonly kind: "pause"; readonly checkpointId: string }
    | { readonly kind: "halt"; readonly mode: "checkpointed"; readonly checkpointId: string }
    | { readonly kind: "halt"; readonly mode: "forced"; readonly authorizedBy: string; readonly conflictId: string }
    | { readonly kind: "quarantine"; readonly revokedClaims: readonly [string, ...string[]] }
    | { readonly kind: "reassign"; readonly toAgentId: string }; // the invented 6th kind

  function assertNeverStandIn(value: never): never {
    throw new Error(`Unreachable: unhandled StandInIntervention ${JSON.stringify(value)}`);
  }

  function describeStandIn(value: StandInIntervention): string {
    switch (value.kind) {
      case "observe":
        return "observe";
      case "warn":
        return `warn: ${value.message}`;
      case "pause":
        return `pause: ${value.checkpointId}`;
      case "halt":
        switch (value.mode) {
          case "checkpointed":
            return `halt/checkpointed: ${value.checkpointId}`;
          case "forced":
            return `halt/forced: ${value.authorizedBy} for ${value.conflictId}`;
          default:
            return assertNeverStandIn(value);
        }
      case "quarantine":
        return `quarantine: ${value.revokedClaims.join(",")}`;
      case "reassign":
        return `reassign: ${value.toAgentId}`;
      // If the "reassign" case just above is deleted (the falsifiability
      // experiment this test documents — see the block comment above this
      // type), `value` at this point narrows to
      // `{ kind: "reassign"; toAgentId: string }`, which is NOT assignable
      // to `never` — `assertNeverStandIn(value)` on the next line then
      // fails to compile (TS2345) until the "reassign" case is restored.
      // This file is committed with the case present (and compiling)
      // because a genuinely broken build cannot be committed; the PR
      // report for this milestone records deleting this exact case,
      // watching `npm run typecheck` fail on this line, and restoring it.
      default:
        return assertNeverStandIn(value);
    }
  }

  it("handles every one of the seven stand-in kinds, including the invented 6th top-level kind ('reassign')", () => {
    expect(describeStandIn({ kind: "observe" })).toBe("observe");
    expect(describeStandIn({ kind: "reassign", toAgentId: "agent-2" })).toBe("reassign: agent-2");
  });

  it("the real Intervention union is exhaustively matched by assertNeverIntervention today, for all five real kinds", () => {
    function describeReal(value: Intervention): string {
      switch (value.kind) {
        case "observe":
          return "observe";
        case "warn":
          return value.message;
        case "pause":
          return value.checkpointId;
        case "halt":
          switch (value.mode) {
            case "checkpointed":
              return value.checkpointId;
            case "forced":
              return `${value.authorizedBy}:${value.conflictId}`;
            default:
              return assertNeverIntervention(value);
          }
        case "quarantine":
          return value.revokedClaims.join(",");
        default:
          return assertNeverIntervention(value);
      }
    }
    expect(describeReal({ kind: "observe" })).toBe("observe");
    expect(describeReal({ kind: "halt", mode: "forced", authorizedBy: ALICE, conflictId: SOME_CONFLICT })).toBe(
      `${ALICE}:${SOME_CONFLICT}`,
    );
  });
});

describe("assertValidHaltForced — the parallel RUNTIME guard against an unsafe cast", () => {
  it("accepts a genuinely valid halt/forced value", () => {
    const valid: HaltForced = { kind: "halt", mode: "forced", authorizedBy: ALICE, conflictId: SOME_CONFLICT };
    expect(assertValidHaltForced(valid)).toEqual({ ok: true });
  });

  it("rejects a value that reached the HaltForced shape via an unsafe cast with authorizedBy missing entirely", () => {
    // The type system is bypassed here on purpose — this is exactly the
    // "deliberate cast" scenario the plan's own success criteria names:
    // a value that TypeScript is told to trust, but whose actual runtime
    // shape never went through real construction.
    const bypassed = { kind: "halt", mode: "forced", conflictId: SOME_CONFLICT } as unknown as HaltForced;
    const result = assertValidHaltForced(bypassed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("missing-authorized-by");
    }
  });

  it("rejects a value with authorizedBy present but empty (still not a real authorization)", () => {
    const bypassed = {
      kind: "halt",
      mode: "forced",
      authorizedBy: "" as unknown as HumanId,
      conflictId: SOME_CONFLICT,
    } as HaltForced;
    const result = assertValidHaltForced(bypassed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("missing-authorized-by");
    }
  });

  it("rejects a value missing conflictId even when authorizedBy is present", () => {
    const bypassed = { kind: "halt", mode: "forced", authorizedBy: ALICE } as unknown as HaltForced;
    const result = assertValidHaltForced(bypassed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("missing-conflict-id");
    }
  });

  /**
   * DISCLOSED, ACCEPTED LIMIT — not a bug, and not silently discovered:
   * independent verification (L4 VERIFY) reported this EXACT value as a
   * "working bypass" of `halt`/`forced`'s authorization requirement:
   *
   *     export const attack1: HaltForced = {
   *       kind: "halt", mode: "forced",
   *       authorizedBy: "not-a-real-human", conflictId: "fake-conflict",
   *     } as unknown as HaltForced;
   *
   * `assertValidHaltForced(attack1)` returning `{ ok: true }` is CORRECT
   * behavior for what this function actually checks (both fields present
   * and non-empty — see the function's own doc comment, rewritten after
   * this report to state that scope honestly) — the report's framing that
   * this was a defect has been narrowed, not the code: no field-presence
   * check, and no TypeScript design at all, can distinguish a genuine
   * human authorization from a fabricated string once the whole object
   * was reached via `as unknown as X`. This test pins that fact as an
   * intentional, accepted limit — see `.genesis/decisions/
   * 0001-contracts.md` Decision 2 for the full incident report — so a
   * future reader finds a passing, documented test here instead of
   * rediscovering the same "bypass."
   */
  it("DISCLOSED LIMIT: a fully-formed cast with fabricated (but present, non-empty) fields is NOT caught — reproduces the exact reported bypass", () => {
    const attack1 = {
      kind: "halt",
      mode: "forced",
      authorizedBy: "not-a-real-human",
      conflictId: "fake-conflict",
    } as unknown as HaltForced;
    expect(assertValidHaltForced(attack1)).toEqual({ ok: true });
  });
});
