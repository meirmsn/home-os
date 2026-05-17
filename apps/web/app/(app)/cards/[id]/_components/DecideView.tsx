// What: Server component for the DECIDE state body on /cards/[id].
//       Renders: confirmed severity chip + final diagnosis + two
//       <PathCard /> components side-by-side (DIY + Contractor) +
//       <ChoosePath /> (the four commit buttons) + a collapsible
//       "How we diagnosed this" reusing <ConversationRow />. Each
//       PathCard's editorSlot mounts an <EstimateEditor /> client
//       component.
// Why:  spec § Screens. The DECIDE body composes existing
//       presentational primitives — the file itself does no fetches.
//       The page (cards/[id]/page.tsx) passes down the parsed jsonb
//       values + the prior conversation thread.
// Does NOT: Fire decide_view_opened — that's a client-side concern
//           handled by the <DecideViewOpenedCapture /> child so this
//           file stays server-renderable. (decide_view_opened needs
//           a once-per-card-id guard via sessionStorage, which is a
//           client-only API.)

import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';
import { ChoosePath } from './ChoosePath';
import { ConversationRow, type ConversationRowData } from './ConversationRow';
import { DecideViewOpenedCapture } from './DecideViewOpenedCapture';
import { EstimateEditor } from './EstimateEditor';
import { PathCard } from './PathCard';
import { severityChipClasses, type Severity } from './_severity-chip';

export type DecideViewInputRow = ConversationRowData & {
  created_at: string;
};

export type DecideViewProps = {
  cardId: string;
  diagnosis: string | null;
  severity: Severity | null;
  diyEstimate: DiyExpansion | null;
  diyOverride: DiyExpansion | null;
  contractorEstimate: ContractorExpansion | null;
  contractorOverride: ContractorExpansion | null;
  monitoringCadenceDays: number | null;
  /** Full triage_conversations thread for the collapsible "How we
   *  diagnosed this". May be empty when the card was confirmed by an
   *  earlier flow that didn't persist the thread (defensive). */
  thread: DecideViewInputRow[];
};

/** DECIDE state body composition. */
export function DecideView(props: DecideViewProps) {
  const chip = props.severity ? severityChipClasses(props.severity) : null;
  return (
    <section data-testid="decide-view" className="space-y-5">
      <DecideViewOpenedCapture cardId={props.cardId} />

      <header className="space-y-2">
        {chip && (
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${chip.bg} ${chip.text}`}
            data-testid="decide-severity-chip"
          >
            {chip.label}
          </span>
        )}
        <h2 className="text-[var(--color-text-primary)] text-xl font-medium">
          {props.diagnosis ?? 'Diagnosis pending.'}
        </h2>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <PathCard
          variant="diy"
          cardId={props.cardId}
          estimate={props.diyEstimate}
          override={props.diyOverride}
          editorSlot={
            props.diyEstimate ? (
              <EstimateEditor
                variant="diy"
                cardId={props.cardId}
                initial={props.diyOverride ?? props.diyEstimate}
                hasOverride={props.diyOverride !== null}
              />
            ) : undefined
          }
        />
        <PathCard
          variant="contractor"
          cardId={props.cardId}
          estimate={props.contractorEstimate}
          override={props.contractorOverride}
          editorSlot={
            props.contractorEstimate ? (
              <EstimateEditor
                variant="contractor"
                cardId={props.cardId}
                initial={props.contractorOverride ?? props.contractorEstimate}
                hasOverride={props.contractorOverride !== null}
              />
            ) : undefined
          }
        />
      </div>

      <ChoosePath
        cardId={props.cardId}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={props.monitoringCadenceDays}
      />

      {props.thread.length > 0 && (
        <details className="mt-2" data-testid="decide-how-we-diagnosed">
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
