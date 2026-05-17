// What: Server component for a single DIY OR Contractor "path card"
//       on the DECIDE screen. Renders the collapsed-summary header
//       (skill_level / contractor_type chip + total / range) plus a
//       native `<details>` toggle that expands into the full
//       breakdown (materials/tools/steps/gotchas for DIY;
//       questions/red_flags/good_completion for Contractor). When
//       the override column is non-null, an "edited" badge replaces
//       the "AI estimate" tag.
// Why:  spec § Screens — both PathCards render side-by-side inside
//       <DecideView />. The native `<details>` element gives JS-free
//       toggle behavior; client-side editing is delegated to a
//       paired <EstimateEditor /> when the user taps "Edit estimate".
//       The card itself is purely presentational — no fetches, no
//       side effects.
// Does NOT: Read from the database (DecideView passes the parsed
//           values down). Doesn't fire PostHog (those events come
//           from EstimateEditor + ChoosePath). Doesn't enforce the
//           override-or-app selection — caller picks which jsonb to
//           pass via the `estimate` prop.

import type { ReactNode } from 'react';
import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

/** Format a numeric range as a dollar string. `min == max` collapses
 *  to a single value; otherwise prints `$min–$max`. Rounds to whole
 *  dollars (per spec — estimates are coarse). */
function dollarRange(min: number, max: number): string {
  const lo = Math.round(min);
  const hi = Math.round(max);
  if (lo === hi) return `$${lo}`;
  return `$${lo}–$${hi}`;
}

/** Format a numeric range of hours. */
function hoursRange(min: number, max: number): string {
  if (min === max) return `${min} h`;
  return `${min}–${max} h`;
}

/** Props for the DIY variant. */
export type PathCardDiyProps = {
  variant: 'diy';
  cardId: string;
  estimate: DiyExpansion | null;
  override: DiyExpansion | null;
  /** Slot for the editor + reset link (mounted by DecideView so the
   *  PathCard itself stays a pure server component). */
  editorSlot?: ReactNode;
};

/** Props for the Contractor variant. */
export type PathCardContractorProps = {
  variant: 'contractor';
  cardId: string;
  estimate: ContractorExpansion | null;
  override: ContractorExpansion | null;
  editorSlot?: ReactNode;
};

export type PathCardProps = PathCardDiyProps | PathCardContractorProps;

/** Common wrapper — header band + collapsible body. */
function CardShell({
  title,
  badge,
  summary,
  children,
  testId,
}: {
  title: string;
  badge: string;
  summary: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-[var(--color-text-primary)] text-lg font-medium">
          {title}
        </h2>
        <span
          data-testid={`${testId}-badge`}
          className="text-xs text-[var(--color-text-secondary)]"
        >
          {badge}
        </span>
      </header>
      <p className="text-[var(--color-text-secondary)] mt-1 text-sm">
        {summary}
      </p>
      <details className="mt-3">
        <summary className="text-[var(--color-text-primary)] cursor-pointer text-sm">
          Tap to expand
        </summary>
        <div className="mt-3 space-y-4">{children}</div>
      </details>
    </section>
  );
}

/** Render the DIY breakdown body inside the expanded section. */
function DiyBody({ d }: { d: DiyExpansion }) {
  return (
    <>
      <p
        data-testid="path-card-diy-skill"
        className="text-[var(--color-text-secondary)] text-sm"
      >
        Skill level: <span className="font-medium">{d.skill_level}</span>
        {' · '}
        Time:{' '}
        <span className="font-medium">
          {hoursRange(d.time_hours_min, d.time_hours_max)}
        </span>
      </p>

      {d.materials.length > 0 && (
        <div>
          <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
            Materials
          </h3>
          <ul className="text-[var(--color-text-secondary)] space-y-1 text-sm">
            {d.materials.map((m, i) => (
              <li key={i}>
                {m.name} · {dollarRange(m.cost_min, m.cost_max)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.tools.length > 0 && (
        <div>
          <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
            Tools
          </h3>
          <ul className="text-[var(--color-text-secondary)] space-y-1 text-sm">
            {d.tools.map((t, i) => (
              <li key={i}>
                {t.name} · {dollarRange(t.cost_min, t.cost_max)}
                {t.optional ? ' (optional)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
          Steps
        </h3>
        <ol className="text-[var(--color-text-secondary)] list-decimal space-y-1 pl-5 text-sm">
          {d.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
          Watch out for
        </h3>
        <p className="text-[var(--color-text-secondary)] text-sm">
          {d.gotchas}
        </p>
      </div>

      <div>
        <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
          When to stop and call a pro
        </h3>
        <p className="text-[var(--color-text-secondary)] text-sm">
          {d.abort_condition}
        </p>
      </div>
    </>
  );
}

/** Render the Contractor breakdown body inside the expanded section. */
function ContractorBody({ c }: { c: ContractorExpansion }) {
  return (
    <>
      <p
        data-testid="path-card-contractor-type"
        className="text-[var(--color-text-secondary)] text-sm"
      >
        Type: <span className="font-medium">{c.contractor_type}</span>
      </p>

      <div>
        <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
          Questions to ask
        </h3>
        <ul className="text-[var(--color-text-secondary)] list-disc space-y-1 pl-5 text-sm">
          {c.questions_for_contractor.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </div>

      {c.red_flags.length > 0 && (
        <div>
          <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
            Red flags
          </h3>
          <ul className="text-[var(--color-text-secondary)] list-disc space-y-1 pl-5 text-sm">
            {c.red_flags.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-[var(--color-text-primary)] mb-1 text-sm font-medium">
          What good completion looks like
        </h3>
        <p className="text-[var(--color-text-secondary)] text-sm">
          {c.good_completion}
        </p>
      </div>
    </>
  );
}

/** DIY-or-Contractor path card. Picks override over app estimate per
 *  spec § D4 — they're never merged. */
export function PathCard(props: PathCardProps): ReactNode {
  if (props.variant === 'diy') {
    const active = props.override ?? props.estimate;
    if (!active) {
      return (
        <CardShell
          title="DIY"
          badge="Estimate unavailable"
          summary="No DIY estimate is on this card yet."
          testId="path-card-diy"
        >
          <p className="text-[var(--color-text-secondary)] text-sm">
            The triage didn&apos;t produce a DIY breakdown. You can still choose
            Contractor or Monitor.
          </p>
        </CardShell>
      );
    }
    const badge = props.override ? 'edited' : 'AI estimate';
    const summary = `${active.skill_level} · ${hoursRange(
      active.time_hours_min,
      active.time_hours_max
    )} · ${dollarRange(active.total_min, active.total_max)}`;
    return (
      <CardShell
        title="DIY"
        badge={badge}
        summary={summary}
        testId="path-card-diy"
      >
        <DiyBody d={active} />
        {props.editorSlot}
      </CardShell>
    );
  }

  // Contractor variant
  const active = props.override ?? props.estimate;
  if (!active) {
    return (
      <CardShell
        title="Contractor"
        badge="Estimate unavailable"
        summary="No contractor estimate is on this card yet."
        testId="path-card-contractor"
      >
        <p className="text-[var(--color-text-secondary)] text-sm">
          The triage didn&apos;t produce a contractor breakdown.
        </p>
      </CardShell>
    );
  }
  const badge = props.override ? 'edited' : 'AI estimate';
  const summary = `${active.contractor_type} · ${dollarRange(
    active.cost_range_min,
    active.cost_range_max
  )}`;
  return (
    <CardShell
      title="Contractor"
      badge={badge}
      summary={summary}
      testId="path-card-contractor"
    >
      <ContractorBody c={active} />
      {props.editorSlot}
    </CardShell>
  );
}
