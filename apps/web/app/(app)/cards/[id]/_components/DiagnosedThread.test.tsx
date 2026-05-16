// @vitest-environment happy-dom
// What: Unit tests for <DiagnosedThread />. Locks the confirmed-state
//       body shape: severity chip with the right data-severity + color
//       class, final diagnosis text, monitoring cadence line, the
//       closed-by-default `<details>` collapsible, and the render-by-
//       tool-name dispatch over every thread row.
// Why:  This is the durable record of the AI's reasoning on a card.
//       A regression here would silently break the user's ability to
//       audit the diagnosis.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import {
  DiagnosedThread,
  type DiagnosedThreadInputRow,
} from './DiagnosedThread';

afterEach(() => {
  cleanup();
});

/**
 *
 */
function threadRow(
  o: Partial<DiagnosedThreadInputRow>
): DiagnosedThreadInputRow {
  return {
    role: 'user',
    round: 2,
    content: 'x',
    is_location_ask: false,
    tool_name: null,
    created_at: '2026-05-16T00:00:00.000Z',
    ...o,
  };
}

const STANDARD_ROWS: DiagnosedThreadInputRow[] = [
  threadRow({
    role: 'assistant',
    round: 1,
    content: '{"summary":"Initial read summary."}',
    tool_name: 'record_initial_read',
    created_at: '2026-05-16T00:00:00.000Z',
  }),
  threadRow({
    role: 'user',
    round: 2,
    content: 'about two weeks',
    created_at: '2026-05-16T00:01:00.000Z',
  }),
  threadRow({
    role: 'assistant',
    round: 2,
    content: '{"question":"Has it grown?"}',
    tool_name: 'ask_next_question',
    created_at: '2026-05-16T00:01:01.000Z',
  }),
  threadRow({
    role: 'user',
    round: 3,
    content: 'a little',
    created_at: '2026-05-16T00:02:00.000Z',
  }),
  threadRow({
    role: 'assistant',
    round: 3,
    content: '{"final_diagnosis":"Slow leak. DIY."}',
    tool_name: 'confirm_assessment',
    created_at: '2026-05-16T00:02:01.000Z',
  }),
];

describe('<DiagnosedThread />', () => {
  it('renders the confirmed severity chip with the right data-severity', () => {
    render(
      <DiagnosedThread
        severity="soon"
        diagnosis="Slow leak."
        monitoringCadenceDays={14}
        rows={STANDARD_ROWS}
      />
    );
    const chip = screen.getByTestId('severity-chip-confirmed');
    expect(chip.getAttribute('data-severity')).toBe('soon');
    expect(chip.textContent?.toLowerCase()).toContain('soon');
  });

  it('renders the final diagnosis text', () => {
    render(
      <DiagnosedThread
        severity="monitor"
        diagnosis="The actual diagnosis text."
        monitoringCadenceDays={60}
        rows={STANDARD_ROWS}
      />
    );
    expect(screen.getByText('The actual diagnosis text.')).toBeTruthy();
  });

  it('renders monitoring cadence with the "(AI-proposed)" tag', () => {
    render(
      <DiagnosedThread
        severity="monitor"
        diagnosis="x"
        monitoringCadenceDays={60}
        rows={STANDARD_ROWS}
      />
    );
    const cadence = screen.getByTestId('monitoring-cadence');
    expect(cadence.textContent).toContain('60');
    expect(cadence.textContent).toMatch(/days/i);
    expect(cadence.textContent).toContain('(AI-proposed)');
  });

  it('uses singular "day" for cadence=1', () => {
    render(
      <DiagnosedThread
        severity="urgent"
        diagnosis="x"
        monitoringCadenceDays={1}
        rows={STANDARD_ROWS}
      />
    );
    expect(screen.getByTestId('monitoring-cadence').textContent).toMatch(
      /\bday\b/
    );
  });

  it('"How we diagnosed this" is a <details> element, closed by default', () => {
    render(
      <DiagnosedThread
        severity="soon"
        diagnosis="x"
        monitoringCadenceDays={14}
        rows={STANDARD_ROWS}
      />
    );
    const details = screen.getByTestId(
      'how-we-diagnosed'
    ) as HTMLDetailsElement;
    expect(details.tagName.toLowerCase()).toBe('details');
    expect(details.open).toBe(false);
    // The summary label is rendered.
    expect(screen.getByText(/how we diagnosed this/i)).toBeTruthy();
  });

  it('renders one <ConversationRow /> per thread row in chronological order', () => {
    render(
      <DiagnosedThread
        severity="soon"
        diagnosis="x"
        monitoringCadenceDays={14}
        rows={STANDARD_ROWS}
      />
    );
    // The component renders all 5 rows under the details element.
    // Initial read, user round 2, question round 2, user round 3, confirmed round 3.
    expect(screen.getAllByText(/initial read/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/your reply \(round 2\)/i)).toBeTruthy();
    expect(screen.getByText(/question 2/i)).toBeTruthy();
    expect(screen.getByText(/your reply \(round 3\)/i)).toBeTruthy();
    expect(screen.getAllByText(/confirmed/i).length).toBeGreaterThan(0);
  });

  it('skips monitoring cadence line when monitoringCadenceDays is null', () => {
    render(
      <DiagnosedThread
        severity="cosmetic"
        diagnosis="x"
        monitoringCadenceDays={null}
        rows={STANDARD_ROWS}
      />
    );
    expect(screen.queryByTestId('monitoring-cadence')).toBeNull();
  });
});
