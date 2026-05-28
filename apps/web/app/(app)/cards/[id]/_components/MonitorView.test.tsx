// What: Unit tests for <MonitorView />. Verifies severity chip, monitoring
//       chip, cadence display, overdue indicator, empty state, diagnosis.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MonitorViewProps } from './MonitorView';

// Mock client components to avoid needing full browser environment.
vi.mock('./MonitorViewOpenedCapture', () => ({
  MonitorViewOpenedCapture: () => null,
}));
vi.mock('./CheckInForm', () => ({
  CheckInForm: () => <div data-testid="checkin-form-mock" />,
}));
vi.mock('./CadenceEditor', () => ({
  CadenceEditor: () => <div data-testid="cadence-editor-mock" />,
}));
vi.mock('./ChangePathButton', () => ({
  ChangePathButton: () => <div data-testid="change-path-mock" />,
}));

// Mock Sentry (used by ConversationRow)
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import { MonitorView } from './MonitorView';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const baseProps: MonitorViewProps = {
  cardId: CARD_ID,
  severity: 'monitor',
  diagnosis: 'Minor crack in foundation',
  cadenceDays: 30,
  isOverdue: false,
  nextCheckAt: '2026-06-25T00:00:00Z',
  daysSinceLastCheckin: 5,
  checkIns: [],
  referencePhotos: [],
  thread: [],
  photoTouchpointCount: 2,
};

afterEach(() => {
  cleanup();
});

describe('<MonitorView />', () => {
  it('renders severity chip + monitoring chip', () => {
    render(<MonitorView {...baseProps} />);
    expect(screen.getByTestId('monitor-severity-chip').textContent).toBe(
      'monitor'
    );
    expect(screen.getByTestId('monitoring-chip').textContent).toBe(
      'monitoring'
    );
  });

  it('renders cadence display when not overdue', () => {
    render(<MonitorView {...baseProps} />);
    expect(screen.getByTestId('monitor-cadence-display').textContent).toContain(
      'Check back every 30 days'
    );
  });

  it('renders overdue indicator when past due', () => {
    render(
      <MonitorView {...baseProps} isOverdue={true} daysSinceLastCheckin={5} />
    );
    expect(screen.getByTestId('monitor-overdue').textContent).toContain(
      'Overdue'
    );
    expect(screen.getByTestId('monitor-overdue').textContent).toContain(
      'last checked 5 days ago'
    );
  });

  it('renders overdue with no check-ins', () => {
    render(
      <MonitorView
        {...baseProps}
        isOverdue={true}
        daysSinceLastCheckin={null}
      />
    );
    expect(screen.getByTestId('monitor-overdue').textContent).toContain(
      'no check-ins yet'
    );
  });

  it('renders "No check-ins yet" empty state', () => {
    render(<MonitorView {...baseProps} checkIns={[]} />);
    expect(screen.getByTestId('checkin-timeline-empty')).toBeTruthy();
  });

  it('renders check-in timeline with entries', () => {
    render(
      <MonitorView
        {...baseProps}
        checkIns={[
          {
            id: 'entry1',
            createdAt: '2026-05-25T10:00:00Z',
            notes: 'All good',
            photos: [],
          },
        ]}
      />
    );
    expect(screen.getByTestId('checkin-timeline')).toBeTruthy();
    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('renders diagnosis', () => {
    render(<MonitorView {...baseProps} />);
    expect(screen.getByText('Minor crack in foundation')).toBeTruthy();
  });

  it('renders thread collapsible when thread is non-empty', () => {
    render(
      <MonitorView
        {...baseProps}
        thread={[
          {
            created_at: '2026-05-01T00:00:00Z',
            round: 1,
            role: 'assistant',
            is_location_ask: false,
            tool_name: 'record_initial_read',
            content: JSON.stringify({ summary: 'Test summary' }),
          },
        ]}
      />
    );
    expect(screen.getByTestId('monitor-how-we-diagnosed')).toBeTruthy();
  });

  it('does NOT render thread collapsible when thread is empty', () => {
    render(<MonitorView {...baseProps} thread={[]} />);
    expect(screen.queryByTestId('monitor-how-we-diagnosed')).toBeNull();
  });

  it('renders without severity chip when severity is null', () => {
    render(<MonitorView {...baseProps} severity={null} />);
    expect(screen.queryByTestId('monitor-severity-chip')).toBeNull();
    expect(screen.getByTestId('monitoring-chip')).toBeTruthy();
  });

  it('renders the Compare photos link when photoTouchpointCount >= 2', () => {
    render(<MonitorView {...baseProps} photoTouchpointCount={2} />);
    expect(screen.getByTestId('compare-photos-link').getAttribute('href')).toBe(
      `/cards/${CARD_ID}/compare`
    );
  });

  it('hides the Compare photos link when photoTouchpointCount < 2', () => {
    render(<MonitorView {...baseProps} photoTouchpointCount={1} />);
    expect(screen.queryByTestId('compare-photos-link')).toBeNull();
  });
});
