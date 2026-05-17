// What: Server component for the PLANNED state body on /cards/[id].
//       Renders: confirmed severity chip + "You chose: <path>" banner
//       + chosen-path detail (DIY: materials/tools/steps; Contractor:
//       contractor_type + questions) + a greyed <ChoosePath /> with
//       "✓ Chosen" tag + "Change decision" link.
// Why:  spec § D10 — minimal stub for this PR. PR #2 (planned-state)
//       expands with reminder dates, never-overdue treatment, and the
//       full "what's needed before CLOSE" surface.
// Does NOT: Handle reminder dates, due-date pinning, dashboard-tier
//           lifts. Doesn't fire any PostHog events — the prior commit
//           already fired decide_path_chosen; subsequent
//           decide_path_changed fires from <ChoosePath /> on re-commit.

import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';
import { ChoosePath } from './ChoosePath';
import { ConversationRow, type ConversationRowData } from './ConversationRow';
import { PathCard } from './PathCard';
import { severityChipClasses, type Severity } from './_severity-chip';

type ChosenPath = 'diy' | 'contractor' | 'monitor';

export type PlannedViewInputRow = ConversationRowData & {
  created_at: string;
};

export type PlannedViewProps = {
  cardId: string;
  severity: Severity | null;
  diagnosis: string | null;
  chosenPath: ChosenPath | null;
  diyEstimate: DiyExpansion | null;
  diyOverride: DiyExpansion | null;
  contractorEstimate: ContractorExpansion | null;
  contractorOverride: ContractorExpansion | null;
  monitoringCadenceDays: number | null;
  /** Full triage_conversations thread for the collapsible "How we
   *  diagnosed this" carry-forward (spec § Screens — planned state row
   *  (d)). May be empty when a card was confirmed by an earlier flow
   *  that didn't persist the thread. */
  thread: PlannedViewInputRow[];
};

/**
 *
 */
function chosenLabel(path: ChosenPath): string {
  if (path === 'diy') return 'DIY';
  if (path === 'contractor') return 'Contractor';
  return 'Monitor';
}

/** PLANNED state body. Stub for this PR; PR #2 expands. */
export function PlannedView(props: PlannedViewProps) {
  if (!props.chosenPath) {
    // Should not happen in practice — chosen_path is set by
    // commit_decide when transitioning into planned. Defensive
    // fallback: log via Sentry breadcrumb-equivalent (just render a
    // tame placeholder; the server page has access to Sentry for the
    // breadcrumb itself).
    return (
      <section data-testid="planned-view" className="space-y-3">
        <p className="text-[var(--color-text-secondary)] text-sm">
          Decision pending.
        </p>
      </section>
    );
  }

  const chip = props.severity ? severityChipClasses(props.severity) : null;
  const label = chosenLabel(props.chosenPath);

  return (
    <section data-testid="planned-view" className="space-y-5">
      <header className="space-y-2">
        {chip && (
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${chip.bg} ${chip.text}`}
            data-testid="planned-severity-chip"
          >
            {chip.label}
          </span>
        )}
        <h2
          className="text-[var(--color-text-primary-inverse)] text-xl font-medium"
          data-testid="planned-banner"
        >
          You chose: {label}
        </h2>
        {props.diagnosis && (
          <p className="text-[var(--color-text-secondary)] text-sm">
            {props.diagnosis}
          </p>
        )}
      </header>

      {props.chosenPath === 'diy' && (
        <PathCard
          variant="diy"
          cardId={props.cardId}
          estimate={props.diyEstimate}
          override={props.diyOverride}
        />
      )}
      {props.chosenPath === 'contractor' && (
        <PathCard
          variant="contractor"
          cardId={props.cardId}
          estimate={props.contractorEstimate}
          override={props.contractorOverride}
        />
      )}
      {props.chosenPath === 'monitor' && props.monitoringCadenceDays && (
        <p
          className="text-[var(--color-text-secondary)] text-sm"
          data-testid="planned-monitor-cadence"
        >
          Checking back every {props.monitoringCadenceDays} days.
        </p>
      )}

      <ChoosePath
        cardId={props.cardId}
        cardState="planned"
        prevChosenPath={props.chosenPath}
        proposedCadence={props.monitoringCadenceDays}
      />

      {props.thread.length > 0 && (
        <details className="mt-2" data-testid="planned-how-we-diagnosed">
          <summary className="text-[var(--color-text-secondary)] cursor-pointer text-sm">
            How we diagnosed this
          </summary>
          <div className="mt-3 space-y-3">
            {props.thread.map((row, i) => (
              <ConversationRow key={i} row={row} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
