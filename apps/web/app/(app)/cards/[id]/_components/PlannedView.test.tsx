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

// Default reminder-state + close-flow props — extracted to keep each
// existing test concise after prop expansions. photoTouchpointCount defaults
// to 0 so the Compare photos link is absent unless a test overrides it.
const noReminder = {
  plannedReminderDate: null as string | null,
  isReminderDue: false,
  updatedAt: '2026-05-20T00:00:00Z',
  photoTouchpointCount: 0,
};

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
        thread={[]}
        {...noReminder}
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
        thread={[]}
        {...noReminder}
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
        thread={[]}
        {...noReminder}
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
        thread={[]}
        {...noReminder}
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
        thread={[]}
        {...noReminder}
      />
    );
    expect(screen.getByText('Decision pending.')).toBeTruthy();
    expect(screen.queryByTestId('planned-banner')).toBeNull();
  });

  // Regression: ISSUE-002 — spec § Screens line 190 calls for "(d)
  // Collapsed 'How we diagnosed this' carries forward" in the planned
  // body. Earlier implementation rendered only DecideView's disclosure;
  // PlannedView dropped it. Found by /qa on 2026-05-17.
  it('renders the "How we diagnosed this" disclosure when thread rows exist', () => {
    const threadRow = {
      role: 'assistant' as const,
      round: 1,
      content: JSON.stringify({
        summary: 'Initial read summary.',
        severity_provisional: 'soon',
        contractor_tag_provisional: 'plumber',
        monitoring_cadence_days_provisional: 14,
        what_i_need_to_know: ['How long has this been leaking?'],
        sources: [],
      }),
      is_location_ask: false,
      tool_name: 'record_initial_read',
      created_at: '2026-05-17T00:00:00.000Z',
    };
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
        thread={[threadRow]}
        {...noReminder}
      />
    );
    expect(screen.getByTestId('planned-how-we-diagnosed')).toBeTruthy();
    expect(screen.getByText('How we diagnosed this')).toBeTruthy();
  });

  it('omits the "How we diagnosed this" disclosure when thread is empty', () => {
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
        thread={[]}
        {...noReminder}
      />
    );
    expect(screen.queryByTestId('planned-how-we-diagnosed')).toBeNull();
  });
});

// PR planned-state additions: <BeforeCloseSummary /> + <ReminderEditor />
// mount conditions + reminder-state prop threading.
describe('<PlannedView /> — planned-state extensions', () => {
  it('mounts <BeforeCloseSummary /> for chosenPath=diy', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        {...noReminder}
      />
    );
    expect(screen.getByTestId('before-close-diy')).toBeTruthy();
  });

  it('mounts <BeforeCloseSummary /> for chosenPath=contractor', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath="contractor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        {...noReminder}
      />
    );
    expect(screen.getByTestId('before-close-contractor')).toBeTruthy();
  });

  it('does NOT mount <BeforeCloseSummary /> for chosenPath=monitor (returns null)', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="monitor"
        diagnosis="d"
        chosenPath="monitor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={30}
        thread={[]}
        {...noReminder}
      />
    );
    expect(screen.queryByTestId('before-close-diy')).toBeNull();
    expect(screen.queryByTestId('before-close-contractor')).toBeNull();
  });

  it('mounts <ReminderEditor /> in State A when plannedReminderDate=null', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        plannedReminderDate={null}
        isReminderDue={false}
        updatedAt="2026-05-20T00:00:00Z"
        photoTouchpointCount={0}
      />
    );
    expect(screen.getByTestId('reminder-editor-a')).toBeTruthy();
  });

  it('mounts <ReminderEditor /> in State B for a future reminder', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        plannedReminderDate="2026-12-01"
        isReminderDue={false}
        updatedAt="2026-05-20T00:00:00Z"
        photoTouchpointCount={0}
      />
    );
    expect(screen.getByTestId('reminder-editor-b')).toBeTruthy();
    expect(screen.queryByTestId('reminder-editor-a')).toBeNull();
  });

  it('mounts <ReminderEditor /> in State C when isReminderDue=true', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        plannedReminderDate="2026-05-10"
        isReminderDue={true}
        updatedAt="2026-05-20T00:00:00Z"
        photoTouchpointCount={0}
      />
    );
    expect(screen.getByTestId('reminder-editor-c')).toBeTruthy();
  });

  it('mounts <ReminderEditor /> for chosenPath=monitor (reminder applies to all paths)', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="monitor"
        diagnosis="d"
        chosenPath="monitor"
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={30}
        thread={[]}
        plannedReminderDate={null}
        isReminderDue={false}
        updatedAt="2026-05-20T00:00:00Z"
        photoTouchpointCount={0}
      />
    );
    // BeforeCloseSummary returns null for monitor, but ReminderEditor
    // is mounted regardless — D5 doesn't gate it on chosen_path.
    expect(screen.getByTestId('reminder-editor-a')).toBeTruthy();
  });
});

// close-flow additions: <CloseCardForm /> mount conditions.
describe('<PlannedView /> — close-flow extensions', () => {
  it.each(['diy', 'contractor', 'monitor'] as const)(
    'mounts <CloseCardForm /> for chosenPath=%s',
    (path) => {
      render(
        <PlannedView
          cardId={CARD_ID}
          severity="soon"
          diagnosis="d"
          chosenPath={path}
          diyEstimate={diyEstimate()}
          diyOverride={null}
          contractorEstimate={contractorEstimate()}
          contractorOverride={null}
          monitoringCadenceDays={path === 'monitor' ? 30 : null}
          thread={[]}
          {...noReminder}
        />
      );
      expect(screen.getByTestId('close-card-form-collapsed')).toBeTruthy();
      expect(screen.getByTestId('close-card-expand').textContent).toBe(
        'Mark as closed'
      );
    }
  );

  it('does NOT mount <CloseCardForm /> when chosenPath=null', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath={null}
        diyEstimate={null}
        diyOverride={null}
        contractorEstimate={null}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        {...noReminder}
      />
    );
    expect(screen.queryByTestId('close-card-form-collapsed')).toBeNull();
  });

  it('renders the Compare photos link when photoTouchpointCount >= 2', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        {...noReminder}
        photoTouchpointCount={2}
      />
    );
    expect(screen.getByTestId('compare-photos-link').getAttribute('href')).toBe(
      `/cards/${CARD_ID}/compare`
    );
  });

  it('hides the Compare photos link when photoTouchpointCount < 2', () => {
    render(
      <PlannedView
        cardId={CARD_ID}
        severity="soon"
        diagnosis="d"
        chosenPath="diy"
        diyEstimate={diyEstimate()}
        diyOverride={null}
        contractorEstimate={contractorEstimate()}
        contractorOverride={null}
        monitoringCadenceDays={null}
        thread={[]}
        {...noReminder}
        photoTouchpointCount={1}
      />
    );
    expect(screen.queryByTestId('compare-photos-link')).toBeNull();
  });
});
