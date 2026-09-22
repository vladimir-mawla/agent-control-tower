import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import IncidentDemo from "../IncidentDemo.js";

/**
 * `IncidentDemo.render.test.tsx` — a render-only smoke test over the actual
 * React component, not just `compute-demo-view.ts`'s pure logic
 * (`compute-demo-view.test.ts` already covers that exhaustively). This
 * file exists to catch a narrower, different class of bug: the component
 * itself throwing during render, or silently NOT rendering a panel this
 * milestone's brief requires ("the gate's permitted set and the arbitrated
 * ruling update accordingly").
 *
 * WHY `renderToStaticMarkup`, NOT A DOM-BASED TESTING LIBRARY: this
 * project's own `vitest.config.ts` deliberately keeps `environment: "node"`
 * (no jsdom, no browser globals) so `lib/` stays framework-free — adding a
 * DOM testing dependency (`jsdom`, `@testing-library/react`) purely to
 * simulate a click would mean either splitting the test environment
 * per-file (a real maintenance cost for one component) or widening the
 * whole suite's environment away from "node" for every other package this
 * repo has. `renderToStaticMarkup` needs no DOM at all — it is the same
 * function React itself uses to render to a string on the server — so it
 * runs in this project's existing "node" environment unmodified. The
 * trade-off, stated plainly: this file can prove the component renders the
 * RIGHT markup for a given INITIAL state (via `IncidentDemo`'s own
 * `initialKnobs` prop, added for exactly this purpose), but it cannot
 * simulate a click and observe a re-render — that path is instead covered
 * by `compute-demo-view.test.ts` calling the identical pure function the
 * component's own `onClick`/`onChange` handlers call via `setKnobs`. See
 * `.genesis/decisions/0009-demo.md` for the full argument and the honest
 * limit this leaves (no automated test simulates an actual click in a
 * browser; a human — or a browser-driving tool — verifying the deployed
 * page is still required, and this milestone's own build report does
 * exactly that).
 */

describe("IncidentDemo — render smoke tests over real knob states", () => {
  it("renders the clean-run state (default knobs) without throwing, and shows no conflict yet", () => {
    const html = renderToStaticMarkup(<IncidentDemo />);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Inject AutoScaler");
    expect(html).toContain("No conflict detected");
    expect(html).not.toContain("arbitrate() returned no ruling");
  });

  it("renders the headline no-authorization state: a real detected conflict, a real gate set, and a real halt/checkpointed ruling with escalation flagged", () => {
    const html = renderToStaticMarkup(<IncidentDemo initialKnobs={{ injected: true }} />);
    expect(html).toContain("write-write");
    expect(html).toContain("halt-checkpointed");
    expect(html).toContain("HALT");
    expect(html).toContain("checkpointed");
    expect(html).toContain("escalationRecommended: true");
  });

  it("renders the with-authorization state: halt/forced, escalation cleared", () => {
    const html = renderToStaticMarkup(<IncidentDemo initialKnobs={{ injected: true, authorization: "this-conflict" }} />);
    expect(html).toContain("HALT");
    expect(html).toContain("forced");
    expect(html).toContain("escalationRecommended: false");
  });

  it("renders the wrong-conflict-authorization state identically in outcome to the no-authorization state (still halt/checkpointed, still escalated)", () => {
    const html = renderToStaticMarkup(<IncidentDemo initialKnobs={{ injected: true, authorization: "other-conflict" }} />);
    expect(html).toContain("HALT");
    expect(html).toContain("checkpointed");
    expect(html).toContain("escalationRecommended: true");
  });

  it("renders the stronger-corroboration state: quarantine, not halt", () => {
    const html = renderToStaticMarkup(<IncidentDemo initialKnobs={{ injected: true, rollbackCorroboration: "cross-checked" }} />);
    expect(html).toContain("QUARANTINE");
    expect(html).toContain("escalationRecommended: false");
  });

  it("never renders the error panel for any of the states exercised above", () => {
    const states = [
      {},
      { injected: true },
      { injected: true, authorization: "this-conflict" as const },
      { injected: true, authorization: "other-conflict" as const },
      { injected: true, rollbackCorroboration: "cross-checked" as const },
      { injected: true, checkpoint: "stale" as const },
      { injected: true, checkpoint: "unreachable" as const },
    ];
    for (const initialKnobs of states) {
      const html = renderToStaticMarkup(<IncidentDemo initialKnobs={initialKnobs} />);
      expect(html).not.toContain("demo-error");
      expect(html).not.toContain("could not compute a view");
    }
  });
});
