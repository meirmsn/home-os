// What: Unit tests for <ReminderEditor />. Covers the three render
//       states (A/B/C), expand/save/cancel flows, PATCH request shape,
//       PostHog event firing (set/cleared/edited with signed days_out),
//       and error surfacing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const { routerRefresh, posthogCapture } = vi.hoisted(() => ({
  routerRefresh: vi.fn(),
  posthogCapture: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

import { ReminderEditor } from './ReminderEditor';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  routerRefresh.mockReset();
  posthogCapture.mockReset();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // Freeze "now" at 2026-05-17 (matches the spec's stated current date)
  // so days_out math is deterministic.
  vi.setSystemTime(new Date('2026-05-17T12:00:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('<ReminderEditor /> — State A (no reminder)', () => {
  it('renders the "Set a reminder" link when plannedReminderDate is null', () => {
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate={null}
        isReminderDue={false}
      />
    );
    expect(screen.getByTestId('reminder-editor-a')).toBeTruthy();
    expect(screen.getByTestId('reminder-set-link').textContent).toBe(
      'Set a reminder'
    );
  });

  it('expands to a native date input on click', () => {
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate={null}
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-set-link'));
    expect(screen.getByTestId('reminder-editor-form')).toBeTruthy();
    const input = screen.getByTestId('reminder-date-input') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('');
    // D5 / Gotcha #12: no min/max constraints.
    expect(input.getAttribute('min')).toBe(null);
    expect(input.getAttribute('max')).toBe(null);
  });

  it('Save → PATCH 200 → fires planned_reminder_set with signed days_out', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        planned_reminder_date: '2026-05-24',
      }),
    });
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate={null}
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-set-link'));
    fireEvent.change(screen.getByTestId('reminder-date-input'), {
      target: { value: '2026-05-24' },
    });
    fireEvent.click(screen.getByTestId('reminder-save'));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/reminder`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ reminder_date: '2026-05-24' }),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('planned_reminder_set', {
      card_id: CARD_ID,
      reminder_date: '2026-05-24',
      days_out: 7, // 2026-05-24 - 2026-05-17 = 7
    });
  });

  it('Save with a past date fires planned_reminder_set with NEGATIVE days_out (Gotcha #9)', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        planned_reminder_date: '2026-05-10',
      }),
    });
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate={null}
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-set-link'));
    fireEvent.change(screen.getByTestId('reminder-date-input'), {
      target: { value: '2026-05-10' },
    });
    fireEvent.click(screen.getByTestId('reminder-save'));
    await waitFor(() => expect(posthogCapture).toHaveBeenCalled());
    expect(posthogCapture).toHaveBeenCalledWith(
      'planned_reminder_set',
      expect.objectContaining({ days_out: -7 })
    );
  });

  it('Cancel collapses without PATCH', () => {
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate={null}
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-set-link'));
    fireEvent.click(screen.getByTestId('reminder-cancel'));
    expect(screen.getByTestId('reminder-editor-a')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('<ReminderEditor /> — State B (future reminder)', () => {
  it('renders the "Revisit by …" subline + Edit/Clear with future date', () => {
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate="2026-06-15"
        isReminderDue={false}
      />
    );
    expect(screen.getByTestId('reminder-editor-b')).toBeTruthy();
    expect(screen.getByTestId('reminder-subline').textContent).toMatch(
      /Revisit by /
    );
    expect(screen.getByTestId('reminder-edit-link')).toBeTruthy();
    expect(screen.getByTestId('reminder-clear-link')).toBeTruthy();
  });

  it('Edit pre-fills the input with the current value', () => {
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate="2026-06-15"
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-edit-link'));
    const input = screen.getByTestId('reminder-date-input') as HTMLInputElement;
    expect(input.value).toBe('2026-06-15');
  });

  it('Edit → Save fires planned_reminder_edited with from/to/days_out', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        planned_reminder_date: '2026-05-10',
      }),
    });
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate="2026-06-01"
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-edit-link'));
    fireEvent.change(screen.getByTestId('reminder-date-input'), {
      target: { value: '2026-05-10' },
    });
    fireEvent.click(screen.getByTestId('reminder-save'));
    await waitFor(() => expect(posthogCapture).toHaveBeenCalled());
    expect(posthogCapture).toHaveBeenCalledWith('planned_reminder_edited', {
      card_id: CARD_ID,
      from_date: '2026-06-01',
      to_date: '2026-05-10',
      days_out: -7,
    });
  });

  it('Clear fires planned_reminder_cleared with had_future_date=true (regret)', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        planned_reminder_date: null,
      }),
    });
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate="2026-06-15"
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-clear-link'));
    await waitFor(() => expect(posthogCapture).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/reminder`,
      expect.objectContaining({
        body: JSON.stringify({ reminder_date: null }),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('planned_reminder_cleared', {
      card_id: CARD_ID,
      had_future_date: true,
    });
  });
});

describe('<ReminderEditor /> — State C (due reminder)', () => {
  it('renders State C variant + Edit/Clear when isReminderDue=true', () => {
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate="2026-05-10"
        isReminderDue={true}
      />
    );
    expect(screen.getByTestId('reminder-editor-c')).toBeTruthy();
    expect(screen.getByTestId('reminder-subline')).toBeTruthy();
    expect(screen.getByTestId('reminder-edit-link')).toBeTruthy();
    expect(screen.getByTestId('reminder-clear-link')).toBeTruthy();
  });

  it('Clear from State C fires planned_reminder_cleared with had_future_date=false (acknowledgment)', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        planned_reminder_date: null,
      }),
    });
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate="2026-05-10"
        isReminderDue={true}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-clear-link'));
    await waitFor(() => expect(posthogCapture).toHaveBeenCalled());
    expect(posthogCapture).toHaveBeenCalledWith('planned_reminder_cleared', {
      card_id: CARD_ID,
      had_future_date: false,
    });
  });
});

describe('<ReminderEditor /> — error surfacing', () => {
  it('surfaces a 400 reason from the server in the inline error region', async () => {
    // Server simulates rejecting a calendar-invalid date (Feb 30) — the
    // client doesn't validate locally; the route handler is the trust
    // boundary. jsdom rejects type=date inputs whose value is calendar-
    // invalid, so we pass a valid-shape date here and let the mocked
    // server return the 400.
    fetchMock.mockResolvedValueOnce({
      status: 400,
      json: async () => ({
        error: 'validation_failed',
        field: 'reminder_date',
        reason: 'not a valid calendar date',
      }),
    });
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate={null}
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-set-link'));
    fireEvent.change(screen.getByTestId('reminder-date-input'), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByTestId('reminder-save'));
    await waitFor(() =>
      expect(screen.getByTestId('reminder-error')).toBeTruthy()
    );
    expect(screen.getByTestId('reminder-error').textContent).toContain(
      'not a valid calendar date'
    );
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('surfaces network errors with a generic retry message', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    render(
      <ReminderEditor
        cardId={CARD_ID}
        plannedReminderDate={null}
        isReminderDue={false}
      />
    );
    fireEvent.click(screen.getByTestId('reminder-set-link'));
    fireEvent.change(screen.getByTestId('reminder-date-input'), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByTestId('reminder-save'));
    await waitFor(() =>
      expect(screen.getByTestId('reminder-error')).toBeTruthy()
    );
    expect(screen.getByTestId('reminder-error').textContent).toMatch(
      /Network error/
    );
    expect(posthogCapture).not.toHaveBeenCalled();
  });
});
