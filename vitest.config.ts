import { defineConfig } from "vitest/config";

// Kept deliberately minimal: no framework plugin (no Next.js, no React)
// because lib/ must stay framework-free through M2's Next.js adoption —
// same discipline as this project's infrastructure siblings, decision-engine,
// shadow-run, and memory-ledger.
//
// Every include glob below except "tests/**/*.test.ts" was empty until its
// own milestone landed — the same "pre-added-ahead-of-need" precedent
// shadow-run's and memory-ledger's own vitest.config.ts document: an empty
// glob costs nothing today and means this file never needs a second edit
// purely to teach vitest where a later, already-planned milestone's tests
// live.
//   - "lib/**/*.test.ts"                  — M1 (contracts) onward
//   - "app/**/*.test.ts"                  — M2 (deploy)
//   - "domains/**/*.test.ts"              — M6 (incident-response domain)
//   - "tests/**/*.test.ts"                — this repo's own smoke test now; M7's
//                                            failure suite later (plan's freeze
//                                            boundary is tests/failures/**)
//   - "components/**/*.test.ts(x)"        — M8 (interactive demo): pure-function
//                                            tests over compute-demo-view.ts /
//                                            format-intervention.ts, plus one
//                                            render smoke test over IncidentDemo.tsx.
//                                            ".test.tsx" is new with M8 — no earlier
//                                            milestone had any React component to
//                                            test at all.
// `environment` stays "node", NOT "jsdom" — still no framework plugin, still no
// DOM. M8's own one render test uses `react-dom/server`'s `renderToStaticMarkup`,
// which needs no DOM, specifically so this line never has to change and lib/'s
// own "framework-free" test environment stays exactly what it always was.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "domains/**/*.test.ts",
      "tests/**/*.test.ts",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
    watch: false,
    // `lib/contracts/__tests__/human-id.test.ts`, `file-inventory.test.ts`,
    // and `import-containment.test.ts` each walk the ENTIRE lib/ tree
    // (including __tests__ itself) and some of them write/remove real,
    // on-disk scratch files inside lib/contracts/__tests__/ as part of
    // their own exploit-regression tests. Vitest's default (`true`) runs
    // different TEST FILES in parallel worker processes — confirmed
    // directly to cause a real, consistently-reproducing (not merely
    // flaky) failure: one file's transient scratch write, mid-flight, gets
    // caught by another file's concurrent full-tree scan, which then fails
    // trying to open a file that was deleted a moment later by the file
    // that created it. `false` runs test files one at a time, matching
    // this repo's own tests' implicit assumption that they own the full
    // lib/ tree for the duration of their own run — necessary correctness,
    // not a performance tuning choice, and cheap at this suite's size.
    fileParallelism: false,
  },
});
