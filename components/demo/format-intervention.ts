import { assertNeverIntervention, type Intervention } from "../../lib/contracts/index.js";
import type { InterventionRuling } from "../../lib/arbitrate/index.js";

/**
 * `format-intervention.ts` — presentation only, over data
 * `compute-demo-view.ts` already read off a real engine return value.
 * Nothing here decides anything or fabricates a claim about what the
 * engine "would" do; every branch below is keyed on `intervention.kind`
 * (and `.mode` for `halt`), exhaustively, via the same
 * `assertNeverIntervention` guard `scripts/demo-incident.ts`'s own
 * `describeIntervention` uses — independently re-derived for this UI
 * rather than imported, since `scripts/**` is not `components/**`, but
 * intentionally the same shape so a reader can compare the CLI's and the
 * browser's own narration of the identical `Intervention` value side by
 * side.
 */
export function formatInterventionHeadline(intervention: Intervention): string {
  switch (intervention.kind) {
    case "observe":
      return "OBSERVE";
    case "warn":
      return "WARN";
    case "pause":
      return "PAUSE";
    case "halt":
      switch (intervention.mode) {
        case "checkpointed":
          return "HALT — checkpointed";
        case "forced":
          return "HALT — forced";
        default:
          return assertNeverIntervention(intervention);
      }
    case "quarantine":
      return "QUARANTINE";
    default:
      return assertNeverIntervention(intervention);
  }
}

export function formatInterventionDetail(intervention: Intervention): string {
  switch (intervention.kind) {
    case "observe":
      return "No action taken. Nothing about this conflict crosses the floor this severity demands.";
    case "warn":
      return intervention.message;
    case "pause":
      return `Checkpoint cited: ${String(intervention.checkpointId)}.`;
    case "halt":
      switch (intervention.mode) {
        case "checkpointed":
          return `Checkpoint cited: ${String(intervention.checkpointId)} (best-effort resumable, not guaranteed).`;
        case "forced":
          return `Authorized by ${String(intervention.authorizedBy)}, scoped to conflict ${String(intervention.conflictId)}.`;
        default:
          return assertNeverIntervention(intervention);
      }
    case "quarantine":
      return `Revoking: ${intervention.revokedClaims.map(String).join(", ")}.`;
    default:
      return assertNeverIntervention(intervention);
  }
}

const RULE_LABELS: Readonly<Record<InterventionRuling["rule"], string>> = {
  "severity-satisfied": "severity-satisfied — the weakest available option already meets this conflict's floor",
  "gate-ceiling": "gate-ceiling — nothing the gate permits reaches the required floor",
  "checkpoint-unrealizable": "checkpoint-unrealizable — a stronger rung was available but no usable checkpoint could realize it",
  "quarantine-unrealizable": "quarantine-unrealizable — a stronger rung was available but no claim could be named to revoke",
  "human-forced-escalation": "human-forced-escalation — a human authorization scoped to this exact conflict fired a forced halt",
};

export function formatRule(rule: InterventionRuling["rule"]): string {
  return RULE_LABELS[rule];
}
