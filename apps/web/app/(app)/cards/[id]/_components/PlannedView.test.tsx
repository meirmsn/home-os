// What: Unit tests for <PlannedView />. Covers the three chosen-path
//       branches (diy / contractor / monitor), the null-chosen
//       defensive fallback, and the planned-state ChoosePath render.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlannedView } from './PlannedView';
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

describe('<PlannedView />', () => {
  it('renders DIY banner + PathCard when chosenPath=diy', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="Slow P-trap leak."
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={null}
      />
    );
    expect(screen.getByTestId('planned-banner').textContent).toBe(
      'You chose: DIY'
    );
    expect(screen.getByTestId('path-card-diy')).toBeTruthy();
    expect(screen.queryByTestId('path-card-contractor')).toBeNull();
  });

  it('renders Contractor banner + PathCard when chosenPath=contractor', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="Slow P-trap leak."
        chosenPath="contractor"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={null}
      />
    );
    expect(screen.getByTestId('planned-banner').textContent).toBe(
      'You chose: Contractor'
    );
    expect(screen.getByTestId('path-card-contractor')).toBeTruthy();
    expect(screen.queryByTestId('path-card-diy')).toBeNull();
  });

  it('renders Monitor banner + cadence line when chosenPath=monitor', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="monitor"
        diagnosis="Watch for spread."
        chosenPath="monitor"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={60}
      />
    );
    expect(screen.getByTestId('planned-banner').textContent).toBe(
      'You chose: Monitor'
    );
    expect(screen.getByTestId('planned-monitor-cadence').textContent).toBe(
      'Checking back every 60 days.'
    );
  });

  it('renders the greyed ChoosePath with "✓ Chosen" tag on the chosen path', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="test"
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={null}
      />
    );
    const diyBtn = screen.getByTestId('choose-diy') as HTMLButtonElement;
    expect(diyBtn.disabled).toBe(true);
    expect(diyBtn.textContent).toContain('✓ Chosen');
    expect(screen.getByTestId('change-decision')).toBeTruthy();
  });

  it('renders "Decision pending." defensive fallback when chosenPath is null', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="test"
        chosenPath={null}
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={null}
      />
    );
    expect(screen.getByText('Decision pending.')).toBeTruthy();
    expect(screen.queryByTestId('planned-banner')).toBeNull();
  });
});
