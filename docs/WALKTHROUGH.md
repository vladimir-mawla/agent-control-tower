# WALKTHROUGH — a ~90-second Loom script for M8's interactive demo

Read this aloud, on the deployed page, performing each bracketed action at that point in the script.
Every line of narration below was checked against the deployed page's actual, live text (see
"Verification" at the bottom) — this is not a script written against intentions, it is a transcript of
an actual click-through of `https://agent-control-tower-nine.vercel.app`, re-read as narration.

## Timing

- Pure narration (176 words) at a natural, deliberate 150-words-per-minute presenter pace, synthesized
  with macOS `say -r 150` and measured with `afinfo`: **76.1 seconds** on the machine this script was
  written on. An independent verifier re-ran the identical `say -r 150` command on a different machine
  and measured **69.7 seconds** for the same 176 words — `say`'s actual output rate depends on the
  system voice and OS build, not just the `-r` argument, so this figure is a rig-dependent estimate, not
  a portable constant. Both runs land comfortably under the ~90s target either way.
- Four on-screen actions (one button click, three radio selections), each needing a moment to move the
  cursor, click, and let the panel visibly update before continuing to speak: estimated **~3 seconds
  each, ~12 seconds total** — also an estimate, not a measurement of an actual recording.
- **Honest estimate: roughly 80–90 seconds**, depending on the voice/OS synthesizing (or the actual
  presenter's own) pace, plus interaction time. Don't be surprised if your own recording comes in a bit
  under 90s — that's expected variance, not a sign you rushed it, and matches this account's own note
  that sibling projects' own walkthroughs landed at 90 and 91 seconds by the same kind of estimate, not a
  guaranteed exact figure.

## The script

> This is Agent Control Tower, live, not a recording. Every value on this page is a real function
> call, running right now in this browser.
>
> Right now it's a clean run: only RollbackBot holds a claim on checkout-service, so there's no
> conflict yet.
>
> **[Click "Inject AutoScaler's competing claim."]**
>
> I click Inject AutoScaler's competing claim. The engine detects it instantly: write-write, both
> agents named.
>
> The gate permits halt-checkpointed, but not quarantine — RollbackBot's evidence is still
> self-reported. The ruling: HALT, checkpointed, flagged for escalation. The tower refuses to force a
> halt on its own evidence alone.
>
> **[Select "Scoped to THIS conflict (checkout-service)" under Human authorization.]**
>
> Now I supply a human authorization, scoped to this exact conflict. The ruling flips: HALT, forced.
> Escalation clears — a human signed off, so it acts.
>
> **[Select "Scoped to a DIFFERENT conflict (write-read|session-cache|...)" under Human authorization.]**
>
> Now a valid authorization, but scoped to a different conflict. Watch: it refuses again — the same
> ruling as before, because that approval wasn't written for this collision.
>
> **[Select "Cross-checked" under RollbackBot's corroboration.]**
>
> One more lever: strengthen RollbackBot's evidence to cross-checked, and quarantine becomes available
> on its own — no human needed.
>
> That's the claim: no forced halt without a human scoped exactly, every time.

## Verification (beat by beat, against the deployed page, not against intentions)

Each step below was performed against `https://agent-control-tower-nine.vercel.app` directly (a live
browser session, not a local build) immediately before this file was written, and the exact text
quoted is what the page actually rendered at that step — copied from the page, not written first and
checked second.

1. **Clean run (page load).** Section 2 read `No conflict detected on checkout-service. RollbackBot's
   own claim is uncontested — nothing for the tower to arbitrate.` Sections 3–4 both read `n/a`.
2. **After clicking "Inject AutoScaler's competing claim."** Section 2: `kind: write-write, resourceId:
   checkout-service, agents: autoscaler, rollbackbot`. Section 3: `halt-checkpointed, observe, pause,
   warn` (no `quarantine`). Section 4: `HALT — checkpointed`, `rule: gate-ceiling`,
   `escalationRecommended: true`.
3. **After selecting "Scoped to THIS conflict."** Section 4: `HALT — forced`, `Authorized by
   ops-lead-jordan, scoped to conflict write-write|checkout-service|autoscaler,rollbackbot.`, `rule:
   human-forced-escalation`, `escalationRecommended: false`, `human authorization matched this
   conflict: true`.
4. **After selecting "Scoped to a DIFFERENT conflict."** Section 4 reverted to byte-identical output to
   step 2: `HALT — checkpointed`, `rule: gate-ceiling`, `escalationRecommended: true`, `human
   authorization matched this conflict: false` — the authorization was refused, not silently reused.
5. **After selecting "Cross-checked" corroboration.** Section 3 gained `quarantine`. Section 4:
   `QUARANTINE`, `Revoking: claim-autoscaler-checkout, claim-rollbackbot-checkout.`, `rule:
   severity-satisfied`, `escalationRecommended: false`.

Steps 2–5 reproduce, in the browser, the identical rulings `npm run demo:incident` prints for this same
conflict (see that script's own "Step 2"–"Step 4" output) — the falsifiable check `.genesis/PLAN.md`
§4 M8 itself names: "injecting the conflicting claim and re-running produces the same ruling as `npm
run demo:incident`'s own fixture for that scenario."
