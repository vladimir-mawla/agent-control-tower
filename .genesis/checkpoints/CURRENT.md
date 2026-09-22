# CURRENT

- **active_loop:** none. This is the G3 genesis repo only — `.genesis/PLAN.md` (G0–G2) is approved,
  the tooling skeleton is in place, and `app/page.tsx` is a placeholder. No engine code exists: M1
  (`lib/contracts/**`) has not started. M1 is a separate milestone with its own branch, its own PR,
  and its own independent (L4) verifier.

- **last updated:** 2026-09-22, immediately after genesis (repo scaffold, `.genesis/` ritual, README,
  smoke test), before any milestone build has begun. Recorded now, honestly, rather than implying
  progress that doesn't exist — matching memory-ledger's own checkpoint discipline: a checkpoint that
  overstates status is "worse than no checkpoint: it is a stated claim that happens to be false."

## Milestone state, as of this revision

| | Status | Where |
|---|---|---|
| M1 contracts | `todo` | designed only (`.genesis/PLAN.md` §4) — no branch, no code |
| M2 deploy | `todo` | designed only |
| M3 conflict detection | `todo` | designed only |
| M4 the gate | `todo` | designed only |
| M5 arbitration | `todo` | designed only |
| M6 domain | `todo` | designed only |
| M7 failure suite | `todo` | designed only |
| M8 interactive demo | `todo` | designed only |
| M9 deliverables | `todo` | designed only |

`main` is the single base history produced by genesis: tooling config, app shell, `.genesis/` ritual,
README, and one smoke test — no `lib/`, no domain code, no deploy yet.

## Known gaps in this repository's own record, stated up front rather than discovered later

- No decision record exists yet in `.genesis/decisions/` — the first one (`0001-contracts.md`) is
  M1's own artifact, not genesis's, matching the sibling projects' convention that an ADR is written
  by the milestone that made the decisions it records.
- This checkpoint has no `model:` field, matching the sibling projects' own noted gap: which model
  did this work is not recoverable from the repository alone. The `Co-Authored-By` trailer on every
  commit is a fixed string the harness writes regardless of which model did the work, and must not be
  read as authorship evidence.
- No live URL exists yet. The account's own standing note applies directly here: "the previous
  project never deployed because it was left to the end" — M2 deploys a live skeleton second, not
  last, specifically to avoid repeating that.
