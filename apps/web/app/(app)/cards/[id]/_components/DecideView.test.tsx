// What: Unit tests for <DecideView />. Server component composition
//       test — verifies severity chip, diagnosis, both PathCards,
//       ChoosePath buttons, and the conversation collapsible all
//       render correctly with the documented prop shape.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DecideView } from './DecideView';
import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}));

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const diyEstimate = (): DiyExpansion => ({
  skill_level: 'intermediate',
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [{ name: 'P-trap kit', cost_min: 12, cost_max: 18 }],
  tools: [{ name: 'wrench', cost_min: 0, cost_max: 25 }],
  total_min: 12,
  total_max: 43,
  gotchas: 'PVC cracks.',
  abort_condition: 'Stop if threads strip.',
  steps: ['one', 'two'],
});

const contractorEstimate = (): ContractorExpansion => ({
  contractor_type: 'plumber',
  cost_range_min: 150,
  cost_range_max: 400,
  questions_for_contractor: ['warrantied?'],
  red_flags: [],
  good_completion: 'no drip',
});

afterEach(() => {
  cleanup();
});

describe('<DecideView />', () => {
  it('renders severity chip + diagnosis', () => {
    render(
      <DecideView
        cardId={CARD_ID}
        diagnosis="Slow water leak from the P-trap."
        severity="soon"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={14}
        thread={[]}
      />
    );
    expect(screen.getByTestId('decide-severity-chip').textContent).toBe('soon');
    expect(screen.getByText('Slow water leak from the P-trap.')).toBeTruthy();
  });

  it('renders both PathCards (DIY + Contractor)', () => {
    render(
      <DecideView
        cardId={CARD_ID}
        diagnosis="test"
        severity="monitor"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={30}
        thread={[]}
      />
    );
    expect(screen.getByTestId('path-card-diy')).toBeTruthy();
    expect(screen.getByTestId('path-card-contractor')).toBeTruthy();
  });

  it('renders ChoosePath with all four buttons', () => {
    render(
      <DecideView
        cardId={CARD_ID}
        diagnosis="test"
        severity="monitor"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={30}
        thread={[]}
      />
    );
    expect(screen.getByTestId('choose-path')).toBeTruthy();
    expect(screen.getByTestId('choose-diy')).toBeTruthy();
    expect(screen.getByTestId('choose-contractor')).toBeTruthy();
    expect(screen.getByTestId('choose-monitor')).toBeTruthy();
    expect(screen.getByTestId('choose-dismiss')).toBeTruthy();
  });

  it('hides "How we diagnosed this" collapsible when thread is empty', () => {
    render(
      <DecideView
        cardId={CARD_ID}
        diagnosis="test"
        severity="monitor"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={30}
        thread={[]}
      />
    );
    expect(screen.queryByTestId('decide-how-we-diagnosed')).toBeNull();
  });

  it('shows "How we diagnosed this" collapsible when thread has rows', () => {
    render(
      <DecideView
        cardId={CARD_ID}
        diagnosis="test"
        severity="monitor"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={30}
        thread={[
          {
            round: 1,
            role: 'assistant',
            content: JSON.stringify({
              summary: 'Initial read',
              severity_provisional: 'monitor',
              what_im_confident_about: 'leak source',
              what_i_need_to_know: ['how long?'],
              sources: [],
            }),
            tool_name: 'record_initial_read',
            is_location_ask: false,
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />
    );
    expect(screen.getByTestId('decide-how-we-diagnosed')).toBeTruthy();
  });

  it('falls back to "Diagnosis pending." when diagnosis is null', () => {
    render(
      <DecideView
        cardId={CARD_ID}
        diagnosis={null}
        severity={null}
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
      />
    );
    expect(screen.getByText('Diagnosis pending.')).toBeTruthy();
    expect(screen.queryByTestId('decide-severity-chip')).toBeNull();
  });

  it('renders both PathCards with "Estimate unavailable" when both estimates are null', () => {
    render(
      <DecideView
        cardId={CARD_ID}
        diagnosis="test"
        severity="monitor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
      />
    );
    expect(screen.getByTestId('path-card-diy-badge').textContent).toBe(
      'Estimate unavailable'
    );
    expect(screen.getByTestId('path-card-contractor-badge').textContent).toBe(
      'Estimate unavailable'
    );
  });
});
