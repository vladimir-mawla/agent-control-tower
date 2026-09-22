import { defineConfig } from "vitest/config";

// Kept deliberately minimal: no framework plugin (no Next.js, no React)
// because lib/ must stay framework-free through M2's Next.js adoption —
// same discipline as this project's infrastructure siblings, decision-engine,
// shadow-run, and memory-ledger.
//
// Every include glob below except "tests/**/*.test.ts" is empty until M1 —
// the same "pre-added-ahead-of-need" precedent shadow-run's and
// memory-ledger's own vitest.config.ts document: an empty glob costs
// nothing today and means this file never needs a second edit purely to
// teach vitest where a later, already-planned milestone's tests live.
//   - "lib/**/*.test.ts"      — M1 (contracts) onward
//   - "app/**/*.test.ts"      — M2 (deploy) / M8 (UI)
//   - "domains/**/*.test.ts"  — M6 (incident-response domain)
//   - "tests/**/*.test.ts"    — this repo's own smoke test now; M7's failure
//                                suite later (plan's freeze boundary is
//                                tests/failures/**)
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "domains/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    watch: false,
  },
});
