// What: Unit tests for <MonitorViewOpenedCapture />. Verifies the
//       once-per-(card x session) firing semantics via sessionStorage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

import { MonitorViewOpenedCapture } from './MonitorViewOpenedCapture';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  posthogCapture.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('<MonitorViewOpenedCapture />', () => {
  it('fires monitor_view_opened on first mount', () => {
    render(
      <MonitorViewOpenedCapture
        cardId={CARD_ID}
        daysSinceLastCheckin={5}
        isOverdue={false}
      />
    );
    expect(posthogCapture).toHaveBeenCalledWith('monitor_view_opened', {
      card_id: CARD_ID,
      days_since_last_checkin: 5,
      is_overdue: false,
    });
  });

  it('writes the session-storage sentinel after firing', () => {
    render(
      <MonitorViewOpenedCapture
        cardId={CARD_ID}
        daysSinceLastCheckin={null}
        isOverdue={true}
      />
    );
    expect(
      sessionStorage.getItem(`home_os.monitor_view_opened_fired:${CARD_ID}`)
    ).toBe('1');
  });

  it('does NOT fire when the session-storage sentinel is already set', () => {
    sessionStorage.setItem(`home_os.monitor_view_opened_fired:${CARD_ID}`, '1');
    render(
      <MonitorViewOpenedCapture
        cardId={CARD_ID}
        daysSinceLastCheckin={5}
        isOverdue={false}
      />
    );
    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it('fires separately for two different card_ids', () => {
    const OTHER_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    render(
      <MonitorViewOpenedCapture
        cardId={CARD_ID}
        daysSinceLastCheckin={5}
        isOverdue={false}
      />
    );
    render(
      <MonitorViewOpenedCapture
        cardId={OTHER_ID}
        daysSinceLastCheckin={null}
        isOverdue={true}
      />
    );
    expect(posthogCapture).toHaveBeenCalledTimes(2);
  });
});
