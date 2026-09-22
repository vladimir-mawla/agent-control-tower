"use client";

import { useState } from "react";
import {
  DEFAULT_KNOBS,
  computeDemoView,
  type AuthorizationChoice,
  type CheckpointReadiness,
  type DemoKnobs,
} from "./compute-demo-view.js";
import { formatInterventionDetail, formatInterventionHeadline, formatRule } from "./format-intervention.js";
import type { Corroboration } from "../../lib/contracts/index.js";
import styles from "./IncidentDemo.module.css";

/**
 * `IncidentDemo.tsx` — the whole of M8's interactive UI. Plan §4 M8's own
 * "what it refuses" bullet: "to render a ruling the engine didn't actually
 * produce for the exact inputs on screen at that moment (no pre-baked
 * transcript)." This component enforces that by construction, not by
 * discipline: it holds exactly one piece of state (`knobs`, the four
 * levers a viewer can move) and calls `computeDemoView(knobs)` — which
 * calls the real, frozen `detectConflicts`/`combinedAvailableInterventions`/
 * `arbitrate` — directly in its render body, every render. There is no
 * `useEffect`, `useCallback`, `useMemo`, `setTimeout`, or `async` anywhere
 * in this file, and no second piece of state holding a COPY of the
 * engine's output — the account's own standing lesson (a sibling project's
 * M8 predicted, and avoided, a stale-derived-state race the same way:
 * "deriving everything during render is both simplest and safest" when the
 * engine underneath is itself synchronous and pure). Moving a knob calls
 * `setKnobs`, React re-renders, `computeDemoView` runs again against the
 * new knobs, and every panel below reads straight off that fresh result —
 * there is no path through this file where the screen can show a ruling
 * that does not correspond to the knobs currently selected.
 */

interface IncidentDemoProps {
  /** Only for tests: seeds the initial knob state so a render-only smoke test can exercise more than the default state without simulating clicks. Never read again after mount — this is an initial value, not a controlling prop, matching how every other piece of state in this component works. */
  readonly initialKnobs?: Partial<DemoKnobs>;
}

const ROLLBACK_CORROBORATION_OPTIONS: readonly { value: Corroboration; label: string }[] = [
  { value: "self-reported", label: "Self-reported (weakest — nothing else confirms it)" },
  { value: "cross-checked", label: "Cross-checked (a second signal roughly agrees)" },
  { value: "independently-verified", label: "Independently verified (strongest — the tower's own probe)" },
];

const CHECKPOINT_OPTIONS: readonly { value: CheckpointReadiness; label: string }[] = [
  { value: "fresh", label: "Fresh (declared 2 min ago)" },
  { value: "stale", label: "Stale (declared 12 min ago — past the 5-min bound)" },
  { value: "unreachable", label: "Unreachable (reachable: false)" },
];

function authorizationOptions(otherConflictId: string): readonly { value: AuthorizationChoice; label: string }[] {
  return [
    { value: "none", label: "Withheld — no human has acted" },
    { value: "this-conflict", label: "Scoped to THIS conflict (checkout-service)" },
    { value: "other-conflict", label: `Scoped to a DIFFERENT conflict (${otherConflictId})` },
  ];
}

export default function IncidentDemo({ initialKnobs }: IncidentDemoProps) {
  const [knobs, setKnobs] = useState<DemoKnobs>(() => ({ ...DEFAULT_KNOBS, ...initialKnobs }));

  const result = computeDemoView(knobs);

  if (!result.ok) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.errorPanel} role="alert" data-testid="demo-error">
          <p className={styles.sectionTitle}>The demo could not compute a view</p>
          <p className={styles.mono}>{result.error}</p>
          <button
            type="button"
            className={styles.injectButton}
            onClick={() => {
              setKnobs(DEFAULT_KNOBS);
            }}
          >
            Reset to the clean run
          </button>
        </div>
      </div>
    );
  }

  const { view } = result;
  const otherConflictId = view.otherConflictId;

  return (
    <div className={styles.wrapper}>
      <section className={styles.section} aria-label="Controls">
        <h2 className={styles.sectionTitle}>1 — Live inputs</h2>
        <div className={styles.controlsGrid}>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>checkout-service claims</span>
            {!knobs.injected ? (
              <button
                type="button"
                className={styles.injectButton}
                data-testid="inject-button"
                onClick={() => {
                  setKnobs((prev) => ({ ...prev, injected: true }));
                }}
              >
                Inject AutoScaler&rsquo;s competing claim
              </button>
            ) : (
              <button
                type="button"
                className={styles.injectButton}
                data-testid="reset-button"
                onClick={() => {
                  setKnobs(DEFAULT_KNOBS);
                }}
              >
                Reset to the clean run
              </button>
            )}
            <p className={styles.controlHint}>
              {knobs.injected
                ? "RollbackBot (exclusive) and AutoScaler (write) both hold a claim now."
                : "Only RollbackBot holds a claim. Nothing contends for it yet."}
            </p>
          </div>

          <fieldset className={styles.controlGroup}>
            <legend className={styles.controlLabel}>RollbackBot&rsquo;s corroboration</legend>
            <div className={styles.radioRow}>
              {ROLLBACK_CORROBORATION_OPTIONS.map((opt) => (
                <label key={opt.value} className={styles.radioOption}>
                  <input
                    type="radio"
                    name="rollback-corroboration"
                    value={opt.value}
                    checked={knobs.rollbackCorroboration === opt.value}
                    onChange={() => {
                      setKnobs((prev) => ({ ...prev, rollbackCorroboration: opt.value }));
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.controlGroup}>
            <legend className={styles.controlLabel}>Shared checkpoint</legend>
            <div className={styles.radioRow}>
              {CHECKPOINT_OPTIONS.map((opt) => (
                <label key={opt.value} className={styles.radioOption}>
                  <input
                    type="radio"
                    name="checkpoint"
                    value={opt.value}
                    checked={knobs.checkpoint === opt.value}
                    onChange={() => {
                      setKnobs((prev) => ({ ...prev, checkpoint: opt.value }));
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.controlGroup}>
            <legend className={styles.controlLabel}>Human authorization</legend>
            <div className={styles.radioRow}>
              {authorizationOptions(otherConflictId).map((opt) => (
                <label key={opt.value} className={styles.radioOption}>
                  <input
                    type="radio"
                    name="authorization"
                    value={opt.value}
                    checked={knobs.authorization === opt.value}
                    onChange={() => {
                      setKnobs((prev) => ({ ...prev, authorization: opt.value }));
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className={styles.section} aria-label="Detected conflict">
        <h2 className={styles.sectionTitle}>2 — detectConflicts()</h2>
        {view.checkoutConflict === null ? (
          <p className={styles.empty} data-testid="no-conflict">
            No conflict detected on checkout-service. RollbackBot&rsquo;s own claim is uncontested — nothing for the
            tower to arbitrate.
          </p>
        ) : (
          <div className={styles.mono} data-testid="conflict-detail">
            <div>kind: {view.checkoutConflict.kind}</div>
            <div>resourceId: {String(view.checkoutConflict.resourceId)}</div>
            <div>agents: {view.checkoutConflict.agentIds.map(String).join(", ")}</div>
            <div>id: {String(view.checkoutConflict.id)}</div>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="Gate">
        <h2 className={styles.sectionTitle}>3 — combinedAvailableInterventions()</h2>
        {view.available === null ? (
          <p className={styles.empty}>n/a — no conflict to gate.</p>
        ) : (
          <div className={styles.badgeRow} data-testid="available-set">
            {[...view.available].sort().map((kind) => (
              <span key={kind} className={styles.badge}>
                {kind}
              </span>
            ))}
          </div>
        )}
        {view.severity !== null && (
          <p className={styles.controlHint}>
            severity (computeSeverity): <strong>{view.severity}</strong>
          </p>
        )}
      </section>

      <section className={styles.section} aria-label="Ruling">
        <h2 className={styles.sectionTitle}>4 — arbitrate()</h2>
        {view.ruling === null ? (
          <p className={styles.empty}>n/a — no conflict to rule on.</p>
        ) : (
          <div data-testid="ruling">
            <p className={`${styles.rulingHeadline} ${styles[`rulingKind-${view.ruling.intervention.kind}`] ?? ""}`}>
              {formatInterventionHeadline(view.ruling.intervention)}
            </p>
            <p>{formatInterventionDetail(view.ruling.intervention)}</p>
            <p className={styles.controlHint}>rule: {formatRule(view.ruling.rule)}</p>
            <span
              className={`${styles.escalation} ${view.ruling.escalationRecommended ? styles.escalationOn : styles.escalationOff}`}
            >
              escalationRecommended: {String(view.ruling.escalationRecommended)}
            </span>
            <ul className={styles.evidenceList}>
              <li>required floor: {view.ruling.evidence.requiredMinimumRung}</li>
              <li>selected rung: {view.ruling.evidence.selectedRung}</li>
              <li>gate permitted: {view.ruling.evidence.availableKinds.slice().sort().join(", ") || "(nothing beyond observe/warn)"}</li>
              <li>human authorization matched this conflict: {String(view.ruling.evidence.humanAuthorizationMatched)}</li>
            </ul>
          </div>
        )}
      </section>

      <p className={styles.footerNote}>
        Every value above is the live return of this repository&rsquo;s own <code>detectConflicts</code>,{" "}
        <code>combinedAvailableInterventions</code>, and <code>arbitrate</code> — the same functions{" "}
        <code>npm run demo:incident</code> calls for this exact conflict. Nothing on this page is a scripted
        transcript.
      </p>
    </div>
  );
}
