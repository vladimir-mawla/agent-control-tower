import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOBS,
  computeDemoView,
  type AuthorizationChoice,
  type CheckpointReadiness,
  type DemoKnobs,
} from "../compute-demo-view.js";
import type { Corroboration } from "../../../lib/contracts/index.js";

/**
 * `compute-demo-view.test.ts` — the load-bearing test file for M8's own
 * central claim: "everything rendered must come from the real engine ...
 * no hardcoded strings describing what the engine 'would' do." Every
 * assertion below reads a field off `computeDemoView`'s real return value
 * — never a value this test file asserts independently of the call it
 * claims to describe — and several assertions are cross-checked directly
 * against the concrete rulings `scripts/demo-incident.ts` itself asserts
 * for this exact conflict (checkout-service), so a regression in either
 * place would break both.
 */

const ROLLBACK_CORROBORATIONS: readonly Corroboration[] = ["self-reported", "cross-checked", "independently-verified"];
const CHECKPOINT_READINESS: readonly CheckpointReadiness[] = ["fresh", "stale", "unreachable"];
const AUTHORIZATION_CHOICES: readonly AuthorizationChoice[] = ["none", "this-conflict", "other-conflict"];

describe("computeDemoView — never throws, for any reachable UI state", () => {
  it("never returns ok:false across the full knob cross-product (both injected states x every corroboration x every checkpoint x every authorization)", () => {
    for (const injected of [false, true]) {
      for (const rollbackCorroboration of ROLLBACK_CORROBORATIONS) {
        for (const checkpoint of CHECKPOINT_READINESS) {
          for (const authorization of AUTHORIZATION_CHOICES) {
            const knobs: DemoKnobs = { injected, rollbackCorroboration, checkpoint, authorization };
            const result = computeDemoView(knobs);
            expect(result.ok, `knobs=${JSON.stringify(knobs)} produced ok:false: ${!result.ok ? result.error : ""}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("computeDemoView — the clean run (knobs.injected === false)", () => {
  it("detects no conflict on checkout-service, and has nothing to gate or rule on", () => {
    const result = computeDemoView(DEFAULT_KNOBS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.checkoutConflict).toBeNull();
    expect(result.view.available).toBeNull();
    expect(result.view.severity).toBeNull();
    expect(result.view.ruling).toBeNull();
  });

  it("still reports a real, non-empty otherConflictId (session-cache's own detected conflict, unaffected by checkout-service's knobs)", () => {
    const result = computeDemoView(DEFAULT_KNOBS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.otherConflictId.length).toBeGreaterThan(0);
    expect(result.view.otherConflictId).toContain("write-read");
  });
});

describe("computeDemoView — the headline moment (checkout-service, injected), matching scripts/demo-incident.ts", () => {
  it("no authorization: gate withholds quarantine (RollbackBot still self-reported) but grants halt-checkpointed; ruling is halt/checkpointed with escalationRecommended", () => {
    const result = computeDemoView({ ...DEFAULT_KNOBS, injected: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.available?.has("quarantine")).toBe(false);
    expect(result.view.available?.has("halt-checkpointed")).toBe(true);
    expect(result.view.ruling?.intervention.kind).toBe("halt");
    if (result.view.ruling?.intervention.kind === "halt") {
      expect(result.view.ruling.intervention.mode).toBe("checkpointed");
    }
    expect(result.view.ruling?.escalationRecommended).toBe(true);
    expect(result.view.severity).toBe("corrupting");
  });

  it("authorization scoped to THIS conflict: forces halt/forced, escalationRecommended false", () => {
    const result = computeDemoView({ ...DEFAULT_KNOBS, injected: true, authorization: "this-conflict" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.ruling?.intervention.kind).toBe("halt");
    if (result.view.ruling?.intervention.kind === "halt") {
      expect(result.view.ruling.intervention.mode).toBe("forced");
    }
    expect(result.view.ruling?.escalationRecommended).toBe(false);
    expect(result.view.ruling?.evidence.humanAuthorizationMatched).toBe(true);
    expect(result.view.humanAuthorization?.conflictId).toBe(result.view.checkoutConflict?.id);
  });

  it("authorization scoped to a DIFFERENT conflict: refused, identical ruling to the no-authorization run", () => {
    const noAuth = computeDemoView({ ...DEFAULT_KNOBS, injected: true });
    const wrongAuth = computeDemoView({ ...DEFAULT_KNOBS, injected: true, authorization: "other-conflict" });
    expect(noAuth.ok).toBe(true);
    expect(wrongAuth.ok).toBe(true);
    if (!noAuth.ok || !wrongAuth.ok) return;
    expect(wrongAuth.view.ruling?.intervention).toEqual(noAuth.view.ruling?.intervention);
    expect(wrongAuth.view.ruling?.escalationRecommended).toBe(true);
    expect(wrongAuth.view.humanAuthorization?.conflictId).not.toBe(wrongAuth.view.checkoutConflict?.id);
    expect(wrongAuth.view.humanAuthorization?.conflictId).toBe(wrongAuth.view.otherConflictId);
  });

  it("stronger RollbackBot corroboration unlocks quarantine for the WHOLE conflict (intersection policy), and severity-satisfied fires before any authorization is even considered", () => {
    for (const corroboration of ["cross-checked", "independently-verified"] as const) {
      const result = computeDemoView({ ...DEFAULT_KNOBS, injected: true, rollbackCorroboration: corroboration, authorization: "this-conflict" });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.view.available?.has("quarantine")).toBe(true);
      expect(result.view.ruling?.intervention.kind).toBe("quarantine");
      expect(result.view.ruling?.rule).toBe("severity-satisfied");
      expect(result.view.ruling?.escalationRecommended).toBe(false);
    }
  });

  it("a stale or unreachable checkpoint withholds pause/halt-checkpointed, and with no authorization the ruling degrades to warn (gate-ceiling)", () => {
    for (const checkpoint of ["stale", "unreachable"] as const) {
      const result = computeDemoView({ ...DEFAULT_KNOBS, injected: true, checkpoint });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.view.available?.has("pause")).toBe(false);
      expect(result.view.available?.has("halt-checkpointed")).toBe(false);
      expect(result.view.ruling?.intervention.kind).toBe("warn");
      expect(result.view.ruling?.rule).toBe("gate-ceiling");
      expect(result.view.ruling?.escalationRecommended).toBe(true);
    }
  });

  it("a matching human authorization forces halt/forced even with an unreachable checkpoint (forced halt bypasses the gate by construction, not by this UI's choice)", () => {
    const result = computeDemoView({ ...DEFAULT_KNOBS, injected: true, checkpoint: "unreachable", authorization: "this-conflict" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.available?.has("halt-checkpointed")).toBe(false);
    expect(result.view.ruling?.intervention.kind).toBe("halt");
    if (result.view.ruling?.intervention.kind === "halt") {
      expect(result.view.ruling.intervention.mode).toBe("forced");
    }
  });

  it("withholding authorization reports humanAuthorization: null on the view", () => {
    const result = computeDemoView({ ...DEFAULT_KNOBS, injected: true, authorization: "none" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.humanAuthorization).toBeNull();
  });
});
