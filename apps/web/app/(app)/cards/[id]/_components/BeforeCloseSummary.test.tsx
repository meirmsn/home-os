// What: Unit tests for <BeforeCloseSummary />. Covers per-path
//       branching (DIY / Contractor / Monitor), optional-tools filter,
//       +N more overflow expansion, override-wins-over-app, null
//       fallback.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BeforeCloseSummary } from './BeforeCloseSummary';
import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

const diyEstimate = (overrides: Partial<DiyExpansion> = {}): DiyExpansion => ({
  skill_level: 'intermediate',
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [
    { name: 'P-trap kit', cost_min: 12, cost_max: 18 },
    { name: 'Plumber tape', cost_min: 2, cost_max: 4 },
  ],
  tools: [{ name: 'wrench', cost_min: 0, cost_max: 25 }],
  total_min: 12,
  total_max: 43,
  gotchas: 'PVC cracks.',
  abort_condition: 'Stop if threads strip.',
  steps: ['one', 'two'],
  ...overrides,
});

const contractorEstimate = (
  overrides: Partial<ContractorExpansion> = {}
): ContractorExpansion => ({
  contractor_type: 'plumber',
  cost_range_min: 150,
  cost_range_max: 400,
  questions_for_contractor: ['Is the work warrantied?'],
  red_flags: [],
  good_completion: 'no drip',
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('<BeforeCloseSummary /> — DIY variant', () => {
  it('renders materials + non-optional tools inline (first 5)', () => {
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    const list = screen.getByTestId('before-close-diy-inline');
    expect(list.textContent).toContain('P-trap kit');
    expect(list.textContent).toContain('Plumber tape');
    expect(list.textContent).toContain('wrench');
  });

  it('filters tools[].optional === true (Gotcha #8)', () => {
    const diy = diyEstimate({
      tools: [
        { name: 'wrench', cost_min: 0, cost_max: 25 },
        { name: 'hammer', cost_min: 0, cost_max: 10, optional: true },
      ],
    });
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={diy}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    const list = screen.getByTestId('before-close-diy-inline');
    expect(list.textContent).toContain('wrench');
    expect(list.textContent).not.toContain('hammer');
  });

  it('treats optional===false and undefined as required (!== true)', () => {
    const diy = diyEstimate({
      tools: [
        // optional explicitly false → required
        { name: 'screwdriver', cost_min: 0, cost_max: 5, optional: false },
        // optional undefined → required
        { name: 'wrench', cost_min: 0, cost_max: 25 },
      ],
    });
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={diy}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    const list = screen.getByTestId('before-close-diy-inline');
    expect(list.textContent).toContain('screwdriver');
    expect(list.textContent).toContain('wrench');
  });

  it('shows the "+N more" overflow when materials+tools > 5', () => {
    const diy = diyEstimate({
      materials: Array.from({ length: 4 }, (_, i) => ({
        name: `M${i + 1}`,
        cost_min: 0,
        cost_max: 0,
      })),
      tools: [
        { name: 'T1', cost_min: 0, cost_max: 0 },
        { name: 'T2', cost_min: 0, cost_max: 0 },
        { name: 'T3', cost_min: 0, cost_max: 0 },
      ],
    });
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={diy}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    // 7 total entries, 5 inline, 2 in overflow
    const overflow = screen.getByTestId('before-close-diy-overflow');
    expect(overflow.textContent).toContain('+2 more');
    expect(overflow.textContent).toContain('T2');
    expect(overflow.textContent).toContain('T3');
  });

  it('does not render the overflow when <= 5 entries', () => {
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    expect(screen.queryByTestId('before-close-diy-overflow')).toBeNull();
  });

  it('uses the override jsonb when present (override wins)', () => {
    // The app estimate has "P-trap kit"; the override has "Replacement
    // gasket only" — render must surface the override entries.
    const override = diyEstimate({
      materials: [
        { name: 'Replacement gasket only', cost_min: 1, cost_max: 2 },
      ],
      tools: [],
    });
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={override}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    const list = screen.getByTestId('before-close-diy-inline');
    expect(list.textContent).toContain('Replacement gasket only');
    expect(list.textContent).not.toContain('P-trap kit');
  });

  it('renders "Estimate unavailable" when both override and app estimate are null', () => {
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    expect(screen.getByTestId('before-close-diy-unavailable')).toBeTruthy();
    expect(screen.getByText('Estimate unavailable.')).toBeTruthy();
  });

  it('renders an empty-list message when materials + non-optional tools are all empty', () => {
    const diy = diyEstimate({
      materials: [],
      tools: [{ name: 'hammer', cost_min: 0, cost_max: 0, optional: true }],
    });
    render(
      <BeforeCloseSummary
        chosenPath="diy"
        diyEstimate={diy}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    expect(screen.getByText('No materials or tools listed.')).toBeTruthy();
  });
});

describe('<BeforeCloseSummary /> — Contractor variant', () => {
  it('renders the "Contractor to schedule: <type>" headline', () => {
    render(
      <BeforeCloseSummary
        chosenPath="contractor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
      />
    );
    expect(
      screen.getByTestId('before-close-contractor-headline').textContent
    ).toBe('Contractor to schedule: plumber');
  });

  it('shows top-3 questions inline + "+N more questions" overflow', () => {
    const c = contractorEstimate({
      questions_for_contractor: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'],
    });
    render(
      <BeforeCloseSummary
        chosenPath="contractor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={c}
        contractorOverride={null}
      />
    );
    const inline = screen.getByTestId('before-close-contractor-inline');
    expect(inline.textContent).toContain('q1');
    expect(inline.textContent).toContain('q2');
    expect(inline.textContent).toContain('q3');
    expect(inline.textContent).not.toContain('q4');
    const overflow = screen.getByTestId('before-close-contractor-overflow');
    expect(overflow.textContent).toContain('+4 more questions');
    expect(overflow.textContent).toContain('q4');
    expect(overflow.textContent).toContain('q7');
  });

  it('omits the overflow when <= 3 questions', () => {
    render(
      <BeforeCloseSummary
        chosenPath="contractor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
      />
    );
    expect(screen.queryByTestId('before-close-contractor-overflow')).toBeNull();
  });

  it('uses the contractor override jsonb when present (override wins)', () => {
    const override = contractorEstimate({
      contractor_type: 'electrician',
      questions_for_contractor: ['override q'],
    });
    render(
      <BeforeCloseSummary
        chosenPath="contractor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={override}
      />
    );
    expect(
      screen.getByTestId('before-close-contractor-headline').textContent
    ).toContain('electrician');
    expect(
      screen.getByTestId('before-close-contractor-inline').textContent
    ).toContain('override q');
  });

  it('renders "Estimate unavailable" when both contractor jsonbs are null', () => {
    render(
      <BeforeCloseSummary
        chosenPath="contractor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
      />
    );
    expect(
      screen.getByTestId('before-close-contractor-unavailable')
    ).toBeTruthy();
  });
});

describe('<BeforeCloseSummary /> — Monitor variant', () => {
  it('returns null for chosen_path=monitor (cadence line is the summary)', () => {
    const { container } = render(
      <BeforeCloseSummary
        chosenPath="monitor"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
