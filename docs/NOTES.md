# Process notes: how this was actually built, reconstructed from primary sources

Every number below comes from a command run directly against this repository in the session that wrote
this file (2026-09-22), or from reading `.genesis/decisions/*.md` directly. Nothing here is carried
forward from a PR description or summarized secondhand without independently reproducing it. **Merge
times use `mergedAt`, never `createdAt`** — a sibling project's own process record once mislabeled the
two, and this file's own table was generated specifically to avoid repeating that.

**Commands used to build this file:**

```
gh pr list --state all --json number,title,createdAt,mergedAt,headRefName
gh pr view <n> --json comments,reviews,body
gh api repos/vladimir-mawla/agent-control-tower/issues/<n>/comments --jq '.[]|{user:.user.login,created_at:.created_at}'
git log --oneline -20
git checkout <merge-sha> && npx vitest run   # for every milestone's own test count, below
```

## The 17 pull requests, in order, `mergedAt` not `createdAt`

Every one of these 17 PRs was merged — none is open or closed-unmerged. (Scope note: this excludes PR
#18, the M9 PR this document itself ships in, which is open as of this writing and is not part of the
17-PR table below — a document describing its own still-open PR as part of a closed history would be
the same kind of absolute this file exists to avoid.) Nine are
milestone or fix PRs with real content; eight are `chore(genesis): mark <N> done` bumps to
`.genesis/DONE.html`, each opened and merged within roughly 30 seconds of the milestone PR ahead of it
(a ceremonial status update, not build time — separated out below rather than averaged into the
milestones' own durations, which would understate them).

| PR | Title | Merged (UTC) | Duration (created → merged) |
|---|---|---|---|
| 1 | M1 — Contracts | 2026-09-22 02:21:46 | 1:21:58 |
| 2 | mark M1 done | 2026-09-22 02:23:05 | 0:00:28 |
| 3 | M2 — Deploy | 2026-09-22 02:43:48 | 0:08:21 |
| 4 | mark M2 done | 2026-09-22 02:44:48 | 0:00:29 |
| 5 | M3 — Conflict detection | 2026-09-22 03:15:14 | 0:14:12 |
| 6 | mark M3 done | 2026-09-22 03:16:19 | 0:00:28 |
| 7 | M4 — The gate | 2026-09-22 05:07:23 | 1:31:55 |
| 8 | mark M4 done | 2026-09-22 05:08:39 | 0:00:28 |
| 9 | M5 — Arbitration | 2026-09-22 06:00:58 | 0:22:55 |
| 10 | mark M5 done | 2026-09-22 06:02:04 | 0:00:31 |
| 11 | M6 — Domain | 2026-09-22 06:44:03 | 0:18:05 |
| 12 | mark M6 done | 2026-09-22 06:45:11 | 0:00:32 |
| 13 | M7 — Failure suite | 2026-09-22 07:19:15 | 0:10:45 |
| 14 | mark M7 done | 2026-09-22 07:20:25 | 0:00:33 |
| 15 | Fix: incomplete evidence (post-M7) | 2026-09-22 07:48:30 | 0:10:39 |
| 16 | M8 — Interactive demo | 2026-09-22 19:39:43 | 9:05:08 |
| 17 | mark M8 done | 2026-09-22 19:41:32 | 0:00:31 |

**Recounted directly** (`gh api repos/vladimir-mawla/agent-control-tower/issues/<n>/comments`, all 17,
after an earlier draft of this file wrongly asserted a uniform "exactly one, always the bot" pattern —
see the correction note below): PRs 1 and 2 carry zero comments. PRs 3–8 and 10–17 (14 PRs) carry
exactly one comment each, and every one of those 14 is Vercel's own deploy-preview bot, confirmed by
reading its body directly (a project table and a preview-deployment link). **PR #9 is the one exception,
and it is not a bot comment: it carries two — the same Vercel bot comment, and a second, substantive,
human-authored comment from `vladimir-mawla`** posted `2026-09-22T05:54:59Z`, during the M5 fix round —
its content is primary evidence for the M5 narrative below, not merely counted here. **No PR in this
repository carries a GitHub-native review** (`reviews: []` on all 17, confirmed independently) — but PR
#9's second comment shows the "L4 VERIFY" rejection/fix cycle *is* sometimes recorded as an ordinary
issue comment, not only in an ADR or (M1 only) a PR-body edit. The claim in an earlier draft of this file
("in every case it is Vercel's own bot... not a human or reviewer comment") was a false absolute,
produced with the very command this file names as its verification method — three separate universal
claims ("exactly one," "in every case," "not a human comment") failing at once on the one PR that was
the exception. Caught before merge; recorded here rather than silently fixed, per this file's own
purpose.

## Test count at each milestone's own merge commit, run fresh, not carried forward

Each row below was produced by checking out that exact merge commit and running `npx vitest run` against
it directly in this session, then returning to this branch — not read from a PR description.

| Milestone | Merge SHA | Test files | Tests |
|---|---|---|---|
| M1 | `ce84f95` | 13 | 88 |
| M2 | `caeb699` | 13 | 88 |
| M3 | `4bb6121` | 18 | 273 |
| M4 | `2f2b2ae` | 22 | 337 |
| M5 | `3f0d254` | 26 | 375 |
| M6 | `72e7a74` | 30 | 408 |
| M7 | `676edf5` | 42 | 438 |
| fix (post-M7) | `e9f865f` | 43 | 443 |
| M8 | `0b94e73` | 46 | 466 |
| main (mark M8 done) | `b7ce664` | 46 | 466 |

Every one of these ten figures matches the count each milestone's own ADR or PR verification section
claims at the time — independently reproduced here, not merely re-typed from those documents.

## Independent-review rounds and rejections, traced per milestone to the ADR that records them

This account's own practice is an independent "L4 VERIFY" pass against each milestone before it is
merged. Not every milestone was rejected; where one was, the count below is the number of times L4
VERIFY rejected a version of the PR and a new one was produced, per that milestone's own ADR — not
inferred from PR body edits, which exist for only one milestone (see below).

- **M1 — 5 rounds (4 rejections).** `.genesis/decisions/0001-contracts.md` Decision 2: round 2 closed one
  reported `HumanId`-forgery bypass and correctly narrowed the claim on a second; round 3 found two
  further bypasses and, rather than extending the scanner again, relocated the actual guarantee to a
  property of `lib/`'s own code; round 4 found a file-coverage gap (a `.d.ts`/`.js` pair) closed by an
  inventory check; round 5 found the identical lie moved one directory outside `lib/`, closed by making
  `lib/` a closed module graph. **This is the one milestone whose own PR body was edited in place across
  rounds** — PR #1's body carries a `## Update: round 5` section appended to the original text (confirmed
  by reading the live PR body directly); PRs #7, #9, #11, and #16 carry no equivalent update section, so
  their own round histories live only in their ADRs, not in PR-body edits.
- **M2 — 0 rounds recorded.** No rejection is mentioned in `0002-deploy.md` or PR #3's body.
- **M3 — 0 rejection rounds, one post-merge self-correction.** `0003-detection.md`'s own "Falsifiability"
  section records that its first-written claim ("the sabotage experiment broke two tests") was wrong —
  L4 VERIFY reproduced the same experiment and found three failures, not two; re-run a second time by
  this milestone's own author before correcting the ADR. This is a correction to an already-accurate-in-
  substance claim's own count, not a rejected PR.
- **M4 — 4 rounds (3 rejections), all on one check, none on the underlying guarantee.**
  `0004-gate.md` Decision 6: round 2 built a checker-based scan for a reported type-computation leak;
  round 3 found the scan's own AST-annotation enumeration missed inferred types and a generic default;
  round 4 found the round-3 fix still missed a computed property name, a private field, and a type
  parameter's constraint, and ended the loop by demoting the check's own claim from completeness to
  best-effort recall. PR #7's own body has no round narrative — confirmed directly (`gh pr view 7 --json
  body`, no `## Update` heading), so this count is sourced entirely from the ADR.
- **M5 — 1 rejection (2 rounds), with primary evidence beyond the ADR: PR #9 itself records the fix
  round as it happened.** `0005-arbitration.md` Decision 8: L4 VERIFY rejected the first version after
  finding a live bypass (two genuinely different conflicts sharing one `ConflictId` string both fired a
  forced halt off one authorization); fixed with a fail-closed uniqueness precondition, and this ADR's
  own first-version overclaim about what was already tested was corrected in the same revision. PR #9's
  own second comment (`vladimir-mawla`, `2026-09-22T05:54:59Z` — see the recount above), posted while the
  PR was still open, names the fix in the author's own contemporaneous words: `arbitrate` "now throws if
  `conflicts` contains a duplicate id, checked immediately after the existing length precondition,
  before any ruling is produced," explicitly rejects strengthening `matchesConflict` itself as
  "correlation machinery with its own edges," records the property-sweep's own generator gap (it "never
  explored the colliding-id axis") and its fix (a dedicated 100-scenario colliding generator), and gives
  a falsifiability result matching the ADR's own account (removing the new precondition fails exactly 4
  regression tests, nothing else) plus a test count (26 files / 375 tests, up from 369) one step more
  granular than the ADR's own final number. This is the one place in this repository's own PR history
  where the fix round is documented twice, independently, in two different registers (a comment written
  in the moment, an ADR written after) — both agree.
- **M6 — 0 rejections; 3 findings recorded after approval, beyond the milestone's own brief.**
  `0006-domain.md` Decision 4: L4 VERIFY approved M6 as sound, then, independently, wrote a scratch test
  outside the milestone's own scope that hand-constructed a `HaltForced` value bypassing `arbitrate()`
  entirely (Decision 4b) and confirmed the intersection policy's placement cost (Decision 4c) — recorded
  as findings that sharpen this milestone's own honest limits, not as a rejected PR.
- **M7 — 0 rounds recorded.** No rejection is mentioned in `0007-failure-suite.md` or PR #13's body.
- **Fix (post-M7, PR #15) — not a milestone round at all.** `0008-incomplete-evidence.md`'s own framing:
  "adversarial verification against the **merged** M6 domain" found a live, shipped defect
  (`combinedAvailableInterventions` never checked that its `evidence` covered every conflict participant)
  — a post-merge finding against already-frozen code, fixed and documented on its own, distinct from the
  in-flight-PR rejection pattern the milestones above show.
- **M8 — 0 rounds recorded.** No rejection is mentioned in `0009-demo.md` or PR #16's body. This is also
  by far the longest-open PR (9h05m) despite zero recorded rejections — consistent with M8 being the
  first milestone with a real browser surface to build and verify against a live deployment
  (`docs/WALKTHROUGH.md`'s own beat-by-beat verification against the deployed page), not with a hidden
  round of review.

## The nine ADRs

`.genesis/decisions/0001` through `0009`, one per milestone in order, each named for the milestone it
records (`0001-contracts.md` … `0009-demo.md`). Two are notably short relative to the rest — `0002-deploy`
(109 lines) and `0006-domain` (57 lines) — not because less happened, but because M2's own scope (a health
check against two already-simple functions) and M6's own central findings (Decisions 4a–4c) are each
genuinely compact arguments; line count here tracks argument complexity, not milestone effort (M6's own
domain code and its five-conflict scenario are not small).

## A cross-repository claim checked against a stale tree, caught before merge

While drafting `docs/ARCHITECTURE.md`, this milestone needed to check
`~/Desktop/shadow-run/docs/ARCHITECTURE.md` for its structure. `find`/`ls` against that repository's
working tree found no such file — only `docs/WALKTHROUGH.md`. That result was reported as fact ("the
file does not exist in that repository") in an earlier draft of `ARCHITECTURE.md` and this PR's own
description. **It was wrong, and it was wrong for a specific, checkable reason:** `shadow-run`'s working
tree was checked out to `fix-m3-append-and-tokenizer`, a stale branch left over from that project's own
M3 — a branch on which `docs/ARCHITECTURE.md` genuinely did not exist yet, because it was added three
milestones later, by that project's own M9 (`main`, commit `8c7ecd8`, 326 lines). `find` and `ls` were
accurate about the tree they were pointed at and wrong about the repository, because the tree they were
pointed at was not `main`.

This was caught before merge, by the coordinator, and corrected here rather than left in place: the
discrepancy note was removed from `ARCHITECTURE.md`, and that document's own closing section now compares
shadow-run's real `main` content to `decision-engine`'s on the merits (both have the same base shape;
shadow-run's own diagram carries a stage-order-is-not-an-import-chain caveat that is true for shadow-run
and false for this project, which is why this document follows `decision-engine`'s shape instead).

**The general lesson, stated plainly because it is the kind of thing this entire milestone exists to
catch:** a confident negative claim about another repository's contents ("X does not exist") is only as
good as the branch it was checked against, and `find`/`ls` do not report which branch that is. Every
other cross-repository claim in this milestone's own docs was re-audited the same way after this was
found — `git -C <repo> rev-parse --abbrev-ref HEAD` and `git -C <repo> rev-parse origin/main`, confirmed
identical, for `shadow-run`, `decision-engine`, `memory-ledger`, and `agent-trust-layer` — and no other
claim moved.

## What this file deliberately does not do

It does not average or total the per-milestone durations into a single "total build time" figure — the
gap between PR #13's merge (07:19) and PR #15's creation (07:37), and especially between PR #15's merge
(07:48) and PR #16's creation (10:34, roughly 2h46m later), are real elapsed time this repository's own
git history shows but that neither `gh pr list` nor any ADR explains (this account's own work outside
this repository, most likely) — reporting a summed "total engineering time" would silently launder that
gap into implied continuous work, which nothing here actually supports.
