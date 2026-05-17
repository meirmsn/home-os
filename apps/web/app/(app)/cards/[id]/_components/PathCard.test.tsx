// What: Unit tests for <PathCard />. Covers DIY + Contractor variants,
//       collapsed-vs-expanded summary lines, override-vs-app badge,
//       missing-estimate placeholder, and forward-compat with locked
//       jsonb shape edge cases.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { PathCard } from './PathCard';

afterEach(() => {
  cleanup();
});
import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

const CARD_ID = 'card-123';

const diyEstimate = (): DiyExpansion => ({
  skill_level: 'intermediate',
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [{ name: 'P-trap kit', cost_min: 12, cost_max: 18 }],
  tools: [{ name: 'Channel-locks', cost_min: 0, cost_max: 25, optional: true }],
  total_min: 12,
  total_max: 43,
  gotchas: 'PVC cracks if you over-tighten.',
  abort_condition: 'Stop if tailpiece threads strip.',
  steps: ['Place bucket.', 'Loosen slip nuts.', 'Replace and tighten.'],
});

const contractorEstimate = (): ContractorExpansion => ({
  contractor_type: 'plumber',
  cost_range_min: 150,
  cost_range_max: 400,
  questions_for_contractor: ['Will the tailpiece be replaced?'],
  red_flags: ['No written quote.'],
  good_completion: 'No drip under load.',
});

describe('<PathCard variant="diy" />', () => {
  it('renders skill level, time, total in collapsed summary', () => {
    render(
      <PathCard
        variant="diy"
        cardId={CARD_ID}
        estimate={diyEstimate()}
        override={null}
      />
    );
    const card = screen.getByTestId('path-card-diy');
    expect(card.textContent).toContain('intermediate');
    expect(card.textContent).toContain('1–2 h');
    expect(card.textContent).toContain('$12–$43');
  });

  it('shows AI-estimate badge when override is null', () => {
    render(
      <PathCard
        variant="diy"
        cardId={CARD_ID}
        estimate={diyEstimate()}
        override={null}
      />
    );
    expect(screen.getByTestId('path-card-diy-badge').textContent).toBe(
      'AI estimate'
    );
  });

  it('shows "edited" badge when override is non-null', () => {
    render(
      <PathCard
        variant="diy"
        cardId={CARD_ID}
        estimate={diyEstimate()}
        override={{ ...diyEstimate(), total_max: 99 }}
      />
    );
    expect(screen.getByTestId('path-card-diy-badge').textContent).toBe(
      'edited'
    );
    // The override.total_max=99 should drive the summary, not the app
    // estimate.
    const card = screen.getByTestId('path-card-diy');
    expect(card.textContent).toContain('$12–$99');
  });

  it('renders materials, tools, steps, gotchas, abort_condition in expanded body', () => {
    render(
      <PathCard
        variant="diy"
        cardId={CARD_ID}
        estimate={diyEstimate()}
        override={null}
      />
    );
    const card = screen.getByTestId('path-card-diy');
    expect(card.textContent).toContain('P-trap kit');
    expect(card.textContent).toContain('Channel-locks');
    expect(card.textContent).toContain('(optional)');
    expect(card.textContent).toContain('Place bucket.');
    expect(card.textContent).toContain('PVC cracks');
    expect(card.textContent).toContain('Stop if tailpiece threads strip.');
  });

  it('renders "Estimate unavailable" when both estimate + override are null', () => {
    render(
      <PathCard
        variant="diy"
        cardId={CARD_ID}
        estimate={null}
        override={null}
      />
    );
    expect(screen.getByTestId('path-card-diy-badge').textContent).toBe(
      'Estimate unavailable'
    );
  });

  it('mounts editorSlot inside the expanded section when provided', () => {
    render(
      <PathCard
        variant="diy"
        cardId={CARD_ID}
        estimate={diyEstimate()}
        override={null}
        editorSlot={<button>Edit estimate</button>}
      />
    );
    expect(screen.getByText('Edit estimate')).toBeTruthy();
  });
});

describe('<PathCard variant="contractor" />', () => {
  it('renders contractor type + cost range in collapsed summary', () => {
    render(
      <PathCard
        variant="contractor"
        cardId={CARD_ID}
        estimate={contractorEstimate()}
        override={null}
      />
    );
    const card = screen.getByTestId('path-card-contractor');
    expect(card.textContent).toContain('plumber');
    expect(card.textContent).toContain('$150–$400');
  });

  it('renders questions, red flags, good completion in expanded body', () => {
    render(
      <PathCard
        variant="contractor"
        cardId={CARD_ID}
        estimate={contractorEstimate()}
        override={null}
      />
    );
    const card = screen.getByTestId('path-card-contractor');
    expect(card.textContent).toContain('tailpiece be replaced');
    expect(card.textContent).toContain('No written quote.');
    expect(card.textContent).toContain('No drip under load.');
  });

  it('shows edited badge + applies override cost range', () => {
    render(
      <PathCard
        variant="contractor"
        cardId={CARD_ID}
        estimate={contractorEstimate()}
        override={{ ...contractorEstimate(), cost_range_max: 999 }}
      />
    );
    expect(screen.getByTestId('path-card-contractor-badge').textContent).toBe(
      'edited'
    );
    const card = screen.getByTestId('path-card-contractor');
    expect(card.textContent).toContain('$150–$999');
  });

  it('renders "Estimate unavailable" when both estimate + override are null', () => {
    render(
      <PathCard
        variant="contractor"
        cardId={CARD_ID}
        estimate={null}
        override={null}
      />
    );
    expect(screen.getByTestId('path-card-contractor-badge').textContent).toBe(
      'Estimate unavailable'
    );
  });

  it('hides red_flags section when array is empty', () => {
    render(
      <PathCard
        variant="contractor"
        cardId={CARD_ID}
        estimate={{ ...contractorEstimate(), red_flags: [] }}
        override={null}
      />
    );
    const card = screen.getByTestId('path-card-contractor');
    expect(card.textContent).not.toContain('Red flags');
  });

  it('renders editorSlot when provided', () => {
    render(
      <PathCard
        variant="contractor"
        cardId={CARD_ID}
        estimate={contractorEstimate()}
        override={null}
        editorSlot={<button>Edit</button>}
      />
    );
    expect(
      within(screen.getByTestId('path-card-contractor')).getByText('Edit')
    ).toBeTruthy();
  });
});
