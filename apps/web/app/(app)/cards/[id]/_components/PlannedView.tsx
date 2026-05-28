// What: Server component for the PLANNED state body on /cards/[id].
//       Renders: confirmed severity chip + "You chose: <path>" banner
//       + chosen-path detail (DIY: materials/tools/steps; Contractor:
//       contractor_type + questions) + <BeforeCloseSummary /> +
//       greyed <ChoosePath /> + <ReminderEditor /> + "How we diagnosed
//       this" collapsible.
// Why:  spec § D4 + D5 — the planned-state body is the user's home
//       base after they commit to a path. <BeforeCloseSummary /> shows
//       what's needed before CLOSE; <ReminderEditor /> manages the
//       optional revisit date. The header chip in cards/[id]/page.tsx
//       carries the urgency signal when the reminder is due.
// Does NOT: Render the <ReminderDueChip /> in the page header (page.tsx
//           owns that, gated on isReminderDue). Doesn't fire any
//           PostHog events — the prior commit already fired
//           decide_path_chosen; <ChoosePath /> fires decide_path_changed
//           on re-commit; <ReminderEditor /> fires the three reminder
//           events. <BeforeCloseSummary /> is mounted-conditionally for
//           DIY + Contractor; it returns null for chosen_path='monitor'.

import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';
import { BeforeCloseSummary } from './BeforeCloseSummary';
import { ChoosePath } from './ChoosePath';
import { CloseCardForm } from './CloseCardForm';
import { ComparePhotosLink } from './ComparePhotosLink';
import { ConversationRow, type ConversationRowData } from './ConversationRow';
import { PathCard } from './PathCard';
import { ReminderEditor } from './ReminderEditor';
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
  /** Current reminder date for this planned card (ISO `'YYYY-MM-DD'`)
   *  or null when no reminder is set. Threaded into <ReminderEditor />
   *  for its three-state render switch (spec § D5). */
  plannedReminderDate: string | null;
  /** Server-derived "today or past" predicate computed in
   *  cards/[id]/page.tsx (spec § D3 + Gotchas #3). Threaded so the
   *  client component doesn't recompute it (and avoids the midnight-
   *  UTC drift trap). */
  isReminderDue: boolean;
  /** cards.updated_at — proxy for planned_entered_at (close-flow
   *  Gotcha #8). Threaded to <CloseCardForm /> for days_in_planned
   *  computation in the PostHog event. */
  updatedAt: string;
  /** Distinct photo-bearing touchpoint count — gates the "Compare photos"
   *  link (spec § Entry points). Computed in page.tsx. Rare for planned
   *  cards, but a card restored from monitoring can have 2+. */
  photoTouchpointCount: number;
};

/** Human-readable label for the chosen-path banner. */
function chosenLabel(path: ChosenPath): string {
  if (path === 'diy') return 'DIY';
  if (path === 'contractor') return 'Contractor';
  return 'Monitor';
}

/** PLANNED state body — see file header. */
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

      {/* "Before you close" — between the path detail and the
          ChoosePath row, per spec § D4. Returns null for chosen_path=
          'monitor' (cadence line above is the right summary). */}
      <BeforeCloseSummary
        chosenPath={props.chosenPath}
        diyEstimate={props.diyEstimate}
        diyOverride={props.diyOverride}
        contractorEstimate={props.contractorEstimate}
        contractorOverride={props.contractorOverride}
      />

      <ComparePhotosLink
        cardId={props.cardId}
        photoTouchpointCount={props.photoTouchpointCount}
      />

      <ChoosePath
        cardId={props.cardId}
        cardState="planned"
        prevChosenPath={props.chosenPath}
        proposedCadence={props.monitoringCadenceDays}
      />

      {/* Reminder management — bottom of the body per spec § D5.
          The calm-indigo chip in the page header carries the urgency
          cue when isReminderDue=true; this section keeps the
          management affordances (Set/Edit/Clear) in all three states. */}
      <ReminderEditor
        cardId={props.cardId}
        plannedReminderDate={props.plannedReminderDate}
        isReminderDue={props.isReminderDue}
      />

      {/* Close action — below ReminderEditor, before the diagnosis
          collapsible. Shown for all three chosen paths; the null-
          chosenPath branch returns early above. */}
      <CloseCardForm
        cardId={props.cardId}
        chosenPath={props.chosenPath}
        updatedAt={props.updatedAt}
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
