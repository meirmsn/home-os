// What: Server component rendering the "Before you close" callout
//       inside <PlannedView />. Per-path content:
//         - chosen_path='diy':        DIY materials + non-optional tools
//                                       (first 5 inline + <details> for
//                                       the remainder).
//         - chosen_path='contractor': "Contractor to schedule: <type>"
//                                       headline + top-3 questions inline
//                                       + <details> for the remainder.
//         - chosen_path='monitor':    component returns null — the
//                                       "Checking back every N days"
//                                       line in <PlannedView /> is the
//                                       right level of summary.
// Why:  spec § D4 — gives the user a calm, scannable preview of what's
//       needed BEFORE the CLOSE action ships (in PR #1 close-flow).
//       Override jsonb wins over app jsonb via `(override ?? estimate)`
//       — the same pattern PR #27's <PathCard /> codified. Native
//       <details> collapses the long tail so the visible region stays
//       calm.
// Does NOT: Allow per-material checkboxes or edits (spec § D4 — "no
//           big checkboxes vying for attention"). Doesn't fire events.
//           Doesn't render for chosen_path='monitor' / null (Decision
//           pending) — the page-level switch handles those branches.

import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

type ChosenPath = 'diy' | 'contractor' | 'monitor';

export type BeforeCloseSummaryProps = {
  chosenPath: ChosenPath;
  diyEstimate: DiyExpansion | null;
  diyOverride: DiyExpansion | null;
  contractorEstimate: ContractorExpansion | null;
  contractorOverride: ContractorExpansion | null;
};

/** Number of entries shown inline before the "+N more" collapsible. */
const DIY_INLINE = 5;
const CONTRACTOR_INLINE = 3;

/** "Before you close" preview — see file header. */
export function BeforeCloseSummary(props: BeforeCloseSummaryProps) {
  if (props.chosenPath === 'monitor') {
    // D4 — the existing cadence line in <PlannedView /> is the right
    // level of summary; this component returns null.
    return null;
  }

  if (props.chosenPath === 'diy') {
    // Override-wins-over-app per D4 / PR #27 § Gotchas #8 — single
    // source of truth per state. (override ?? estimate) is never merged.
    const diy = props.diyOverride ?? props.diyEstimate;
    if (!diy) return <EstimateUnavailable variant="diy" />;
    return <DiySummary diy={diy} />;
  }

  // chosen_path === 'contractor'
  const c = props.contractorOverride ?? props.contractorEstimate;
  if (!c) return <EstimateUnavailable variant="contractor" />;
  return <ContractorSummary contractor={c} />;
}

/** Placeholder rendered when both override and app jsonb are missing. */
function EstimateUnavailable({ variant }: { variant: 'diy' | 'contractor' }) {
  return (
    <section
      aria-label="Before you close"
      data-testid={`before-close-${variant}-unavailable`}
      className="bg-[var(--color-surface-raised)] rounded-lg border border-[var(--color-border-subtle)] p-4"
    >
      <h3 className="text-[var(--color-text-primary-inverse)] mb-2 text-sm font-semibold">
        Before you close
      </h3>
      <p className="text-[var(--color-text-secondary)] text-sm">
        Estimate unavailable.
      </p>
    </section>
  );
}

/** DIY variant: first N materials + non-optional tools inline + native
 *  <details> for the remainder. */
function DiySummary({ diy }: { diy: DiyExpansion }) {
  // Tools whose `optional === true` are user-already-owned — exclude
  // them from the "to acquire" preview + count (spec § Gotchas #8 — the
  // `!== true` form defaults absent flags to "required").
  const requiredTools = diy.tools.filter((t) => t.optional !== true);
  const combined: { kind: 'material' | 'tool'; name: string }[] = [
    ...diy.materials.map((m) => ({ kind: 'material' as const, name: m.name })),
    ...requiredTools.map((t) => ({ kind: 'tool' as const, name: t.name })),
  ];
  const inline = combined.slice(0, DIY_INLINE);
  const overflow = combined.slice(DIY_INLINE);

  return (
    <section
      aria-label="Before you close"
      data-testid="before-close-diy"
      className="bg-[var(--color-surface-raised)] rounded-lg border border-[var(--color-border-subtle)] p-4 space-y-3"
    >
      <h3 className="text-[var(--color-text-primary-inverse)] text-sm font-semibold">
        Before you close
      </h3>
      {combined.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">
          No materials or tools listed.
        </p>
      ) : (
        <ul
          className="list-inside list-disc space-y-1 text-sm text-[var(--color-text-primary-inverse)]"
          data-testid="before-close-diy-inline"
        >
          {inline.map((entry, i) => (
            <li key={i}>
              {entry.name}
              {entry.kind === 'tool' && (
                <span className="text-[var(--color-text-secondary)]">
                  {' '}
                  (tool)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {overflow.length > 0 && (
        <details data-testid="before-close-diy-overflow">
          <summary className="text-[var(--color-text-secondary)] cursor-pointer text-sm">
            +{overflow.length} more
          </summary>
          <ul className="list-inside list-disc space-y-1 pt-2 text-sm text-[var(--color-text-primary-inverse)]">
            {overflow.map((entry, i) => (
              <li key={i}>
                {entry.name}
                {entry.kind === 'tool' && (
                  <span className="text-[var(--color-text-secondary)]">
                    {' '}
                    (tool)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Contractor variant: contractor_type headline + first N questions
 *  inline + native <details> for the remainder. */
function ContractorSummary({
  contractor,
}: {
  contractor: ContractorExpansion;
}) {
  const inline = contractor.questions_for_contractor.slice(
    0,
    CONTRACTOR_INLINE
  );
  const overflow = contractor.questions_for_contractor.slice(CONTRACTOR_INLINE);

  return (
    <section
      aria-label="Before you close"
      data-testid="before-close-contractor"
      className="bg-[var(--color-surface-raised)] rounded-lg border border-[var(--color-border-subtle)] p-4 space-y-3"
    >
      <h3
        className="text-[var(--color-text-primary-inverse)] text-sm font-semibold"
        data-testid="before-close-contractor-headline"
      >
        Contractor to schedule: {contractor.contractor_type}
      </h3>
      {contractor.questions_for_contractor.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">
          No questions listed yet.
        </p>
      ) : (
        <ul
          className="list-inside list-disc space-y-1 text-sm text-[var(--color-text-primary-inverse)]"
          data-testid="before-close-contractor-inline"
        >
          {inline.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
      {overflow.length > 0 && (
        <details data-testid="before-close-contractor-overflow">
          <summary className="text-[var(--color-text-secondary)] cursor-pointer text-sm">
            +{overflow.length} more questions
          </summary>
          <ul className="list-inside list-disc space-y-1 pt-2 text-sm text-[var(--color-text-primary-inverse)]">
            {overflow.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
