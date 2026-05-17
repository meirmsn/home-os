// What: Unit tests for <DecideViewOpenedCapture />. Verifies the
//       once-per-(card × session) firing semantics via sessionStorage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

import { DecideViewOpenedCapture } from './DecideViewOpenedCapture';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  posthogCapture.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('<DecideViewOpenedCapture />', () => {
  it('fires decide_view_opened on first mount', () => {
    render(<DecideViewOpenedCapture cardId={CARD_ID} />);
    expect(posthogCapture).toHaveBeenCalledWith('decide_view_opened', {
      card_id: CARD_ID,
    });
  });

  it('writes the session-storage sentinel after firing', () => {
    render(<DecideViewOpenedCapture cardId={CARD_ID} />);
    expect(
      sessionStorage.getItem(`home_os.decide_view_opened_fired:${CARD_ID}`)
    ).toBe('1');
  });

  it('does NOT fire when the session-storage sentinel is already set', () => {
    sessionStorage.setItem(`home_os.decide_view_opened_fired:${CARD_ID}`, '1');
    render(<DecideViewOpenedCapture cardId={CARD_ID} />);
    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it('fires separately for two different card_ids', () => {
    const OTHER_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    render(<DecideViewOpenedCapture cardId={CARD_ID} />);
    render(<DecideViewOpenedCapture cardId={OTHER_ID} />);
    expect(posthogCapture).toHaveBeenCalledTimes(2);
    expect(posthogCapture).toHaveBeenNthCalledWith(1, 'decide_view_opened', {
      card_id: CARD_ID,
    });
    expect(posthogCapture).toHaveBeenNthCalledWith(2, 'decide_view_opened', {
      card_id: OTHER_ID,
    });
  });
});
