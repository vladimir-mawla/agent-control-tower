import { describe, expect, it } from "vitest";
import { ALL_CONFLICT_SEVERITIES, type Conflict, type ConflictSeverity } from "../../../lib/contracts/index.js";
import { computeSeverity } from "../severity-policy.js";
import type { BlastRadius } from "../service-catalog.js";

const RANK: Readonly<Record<ConflictSeverity, number>> = { benign: 0, contained: 1, corrupting: 2 };
const ALL_BLAST_RADII: readonly BlastRadius[] = ["small", "medium", "large"];
const DECLARED_KINDS: readonly Conflict[] = ["write-write", "write-read"];

describe("computeSeverity — blast radius sets a baseline; conflict kind can only move it up", () => {
  it("maps small/medium/large to benign/contained/corrupting for a declared (write-write or write-read) conflict", () => {
    expect(computeSeverity("write-write", "small")).toBe("benign");
    expect(computeSeverity("write-write", "medium")).toBe("contained");
    expect(computeSeverity("write-write", "large")).toBe("corrupting");
    expect(computeSeverity("write-read", "small")).toBe("benign");
    expect(computeSeverity("write-read", "medium")).toBe("contained");
    expect(computeSeverity("write-read", "large")).toBe("corrupting");
  });

  it("write-write and write-read are never distinguished from each other — same severity on the same blast radius", () => {
    for (const blastRadius of ALL_BLAST_RADII) {
      expect(computeSeverity("write-write", blastRadius)).toBe(computeSeverity("write-read", blastRadius));
    }
  });

  /**
   * THE FALSIFIABLE CORE OF THIS TEST FILE — plan §2's own refusal for
   * `undeclared-access`, verbatim: "refuses to be treated as any weaker
   * than the other two." Checked here as a real property over every
   * blast radius and every declared kind, not a single example: an
   * `undeclared-access` conflict's severity RANK must never be lower than
   * either declared kind's rank on the identical resource.
   */
  it("undeclared-access is never weaker than write-write/write-read on the same blast radius (the plan's own named refusal, checked as a property)", () => {
    for (const blastRadius of ALL_BLAST_RADII) {
      const undeclaredRank = RANK[computeSeverity("undeclared-access", blastRadius)];
      for (const kind of DECLARED_KINDS) {
        const declaredRank = RANK[computeSeverity(kind, blastRadius)];
        expect(undeclaredRank).toBeGreaterThanOrEqual(declaredRank);
      }
    }
  });

  it("undeclared-access is strictly one step MORE severe than the same blast radius's declared severity, except at the ceiling", () => {
    expect(computeSeverity("undeclared-access", "small")).toBe("contained");
    expect(computeSeverity("undeclared-access", "medium")).toBe("corrupting");
    expect(computeSeverity("undeclared-access", "large")).toBe("corrupting"); // already at the ceiling — cannot go higher, but must not silently drop back down either.
  });

  it("every ConflictSeverity this function can return is a real, closed member of ALL_CONFLICT_SEVERITIES — no invented fourth value", () => {
    for (const blastRadius of ALL_BLAST_RADII) {
      for (const kind of [...DECLARED_KINDS, "undeclared-access" as const]) {
        expect(ALL_CONFLICT_SEVERITIES).toContain(computeSeverity(kind, blastRadius));
      }
    }
  });
});
