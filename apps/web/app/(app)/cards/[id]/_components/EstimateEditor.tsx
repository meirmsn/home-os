'use client';

// What: Client component for editing a DIY or Contractor cost
//       estimate inline inside a <PathCard /> expanded body. Form
//       state mirrors the locked jsonb shape from spec § D3. On save,
//       PATCHes /api/card/[id]/estimate with the override jsonb; on
//       reset, PATCHes with estimate=null to wipe the override.
// Why:  spec § D6 + § Screens — users edit estimates when they have
//       better information (existing tools, real contractor quote).
//       The "edited" badge from <PathCard /> distinguishes overridden
//       cards from app-generated ones; this component is the only way
//       a user reaches that state.
// Does NOT: Talk to Supabase directly — POSTs to /api/card/[id]/estimate
//           and lets the route's RLS-enforced UPDATE handle persistence.
//           Doesn't validate the shape locally — the server validator
//           (parse-estimate-override.ts) is the authoritative trust
//           boundary; the client form mirrors the shape constraints
//           via HTML5 type=number for cheap UX feedback.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

type DiyProps = {
  variant: 'diy';
  cardId: string;
  initial: DiyExpansion;
  hasOverride: boolean;
};

type ContractorProps = {
  variant: 'contractor';
  cardId: string;
  initial: ContractorExpansion;
  hasOverride: boolean;
};

export type EstimateEditorProps = DiyProps | ContractorProps;

type FetchState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

/** Inline DIY/contractor estimate editor — opens on "Edit estimate"
 *  tap, collapses on save/cancel/reset. */
export function EstimateEditor(props: EstimateEditorProps) {
  const [open, setOpen] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const router = useRouter();

  /**
   *
   */
  async function patchEstimate(
    estimate: DiyExpansion | ContractorExpansion | null
  ) {
    setFetchState({ kind: 'saving' });
    try {
      const res = await fetch(`/api/card/${props.cardId}/estimate`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: props.variant, estimate }),
      });
      if (res.status === 200) {
        // Fire the right event before refreshing.
        if (estimate === null) {
          posthog.capture('decide_estimate_reset', {
            card_id: props.cardId,
            path: props.variant,
          });
        } else {
          posthog.capture('decide_estimate_edited', {
            card_id: props.cardId,
            path: props.variant,
          });
        }
        setOpen(false);
        setFetchState({ kind: 'idle' });
        router.refresh();
        return;
      }
      let bodyText = 'Could not save the estimate. Please try again.';
      try {
        const body = await res.json();
        if (body?.reason) bodyText = body.reason;
        else if (body?.error) bodyText = body.error;
      } catch {
        // ignore JSON parse failure; keep the generic message
      }
      setFetchState({ kind: 'error', message: bodyText });
    } catch {
      setFetchState({
        kind: 'error',
        message: 'Network error. Please try again.',
      });
    }
  }

  if (!open) {
    return (
      <div
        className="flex flex-wrap items-center gap-3"
        data-testid={`estimate-editor-${props.variant}`}
      >
        <button
          type="button"
          className="text-sm underline"
          onClick={() => setOpen(true)}
        >
          Edit estimate
        </button>
        {props.hasOverride && (
          <button
            type="button"
            className="text-[var(--color-text-secondary)] text-sm underline"
            data-testid={`reset-${props.variant}`}
            onClick={() => patchEstimate(null)}
          >
            Reset to app estimate
          </button>
        )}
        {fetchState.kind === 'error' && (
          <p
            className="text-[var(--color-act-soon)] text-sm"
            data-testid={`editor-error-${props.variant}`}
          >
            {fetchState.message}
          </p>
        )}
      </div>
    );
  }

  // Open editor — form state mirrors the shape; only the most-edited
  // fields are exposed in this iteration (skill_level + totals for
  // DIY; cost_range for contractor). The full per-field editor is a
  // forward improvement; for now we ship a usable surface that
  // covers the headline numbers the user is most likely to override.
  if (props.variant === 'diy') {
    return (
      <DiyEditor
        initial={props.initial}
        fetchState={fetchState}
        onSave={(updated) => patchEstimate(updated)}
        onCancel={() => {
          setOpen(false);
          setFetchState({ kind: 'idle' });
        }}
      />
    );
  }
  return (
    <ContractorEditor
      initial={props.initial}
      fetchState={fetchState}
      onSave={(updated) => patchEstimate(updated)}
      onCancel={() => {
        setOpen(false);
        setFetchState({ kind: 'idle' });
      }}
    />
  );
}

/**
 *
 */
function DiyEditor({
  initial,
  fetchState,
  onSave,
  onCancel,
}: {
  initial: DiyExpansion;
  fetchState: FetchState;
  onSave: (next: DiyExpansion) => void;
  onCancel: () => void;
}) {
  const [skillLevel, setSkillLevel] = useState(initial.skill_level);
  const [timeMin, setTimeMin] = useState(initial.time_hours_min);
  const [timeMax, setTimeMax] = useState(initial.time_hours_max);
  const [totalMin, setTotalMin] = useState(initial.total_min);
  const [totalMax, setTotalMax] = useState(initial.total_max);

  return (
    <form
      data-testid="estimate-editor-diy-form"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...initial,
          skill_level: skillLevel,
          time_hours_min: timeMin,
          time_hours_max: timeMax,
          total_min: totalMin,
          total_max: totalMax,
        });
      }}
    >
      <label className="block text-sm">
        Skill level
        <select
          className="bg-[var(--color-surface)] mt-1 block w-full rounded border border-[var(--color-border)] p-2"
          value={skillLevel}
          onChange={(e) =>
            setSkillLevel(e.target.value as DiyExpansion['skill_level'])
          }
        >
          <option value="beginner">beginner</option>
          <option value="intermediate">intermediate</option>
          <option value="advanced">advanced</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Time min (h)
          <input
            type="number"
            min={0}
            step={1}
            className="bg-[var(--color-surface)] mt-1 block w-full rounded border border-[var(--color-border)] p-2"
            value={timeMin}
            onChange={(e) => setTimeMin(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Time max (h)
          <input
            type="number"
            min={0}
            step={1}
            className="bg-[var(--color-surface)] mt-1 block w-full rounded border border-[var(--color-border)] p-2"
            value={timeMax}
            onChange={(e) => setTimeMax(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Total min ($)
          <input
            type="number"
            min={0}
            step={1}
            className="bg-[var(--color-surface)] mt-1 block w-full rounded border border-[var(--color-border)] p-2"
            value={totalMin}
            onChange={(e) => setTotalMin(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Total max ($)
          <input
            type="number"
            min={0}
            step={1}
            className="bg-[var(--color-surface)] mt-1 block w-full rounded border border-[var(--color-border)] p-2"
            value={totalMax}
            onChange={(e) => setTotalMax(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="bg-[var(--color-text-primary)] text-[var(--color-bg)] rounded px-3 py-1.5 text-sm"
          disabled={fetchState.kind === 'saving'}
          data-testid="save-diy"
        >
          {fetchState.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="text-sm underline"
          onClick={onCancel}
          data-testid="cancel-diy"
        >
          Cancel
        </button>
        {fetchState.kind === 'error' && (
          <p
            className="text-[var(--color-act-soon)] text-sm"
            data-testid="editor-error-diy"
          >
            {fetchState.message}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 *
 */
function ContractorEditor({
  initial,
  fetchState,
  onSave,
  onCancel,
}: {
  initial: ContractorExpansion;
  fetchState: FetchState;
  onSave: (next: ContractorExpansion) => void;
  onCancel: () => void;
}) {
  const [costMin, setCostMin] = useState(initial.cost_range_min);
  const [costMax, setCostMax] = useState(initial.cost_range_max);

  return (
    <form
      data-testid="estimate-editor-contractor-form"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...initial,
          cost_range_min: costMin,
          cost_range_max: costMax,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Cost min ($)
          <input
            type="number"
            min={0}
            step={1}
            className="bg-[var(--color-surface)] mt-1 block w-full rounded border border-[var(--color-border)] p-2"
            value={costMin}
            onChange={(e) => setCostMin(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Cost max ($)
          <input
            type="number"
            min={0}
            step={1}
            className="bg-[var(--color-surface)] mt-1 block w-full rounded border border-[var(--color-border)] p-2"
            value={costMax}
            onChange={(e) => setCostMax(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="bg-[var(--color-text-primary)] text-[var(--color-bg)] rounded px-3 py-1.5 text-sm"
          disabled={fetchState.kind === 'saving'}
          data-testid="save-contractor"
        >
          {fetchState.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="text-sm underline"
          onClick={onCancel}
          data-testid="cancel-contractor"
        >
          Cancel
        </button>
        {fetchState.kind === 'error' && (
          <p
            className="text-[var(--color-act-soon)] text-sm"
            data-testid="editor-error-contractor"
          >
            {fetchState.message}
          </p>
        )}
      </div>
    </form>
  );
}
