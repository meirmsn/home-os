// @vitest-environment happy-dom
// What: Unit tests for <PhotoComparisonOpenedCapture />. Verifies the
//       once-per-(card × session) firing semantics + the event properties.
// Why:  spec § Metrics / D6 — pin the dedup contract (sessionStorage sentinel)
//       and the { card_state, touchpoint_count } payload.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

import { PhotoComparisonOpenedCapture } from './PhotoComparisonOpenedCapture';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  posthogCapture.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('<PhotoComparisonOpenedCapture />', () => {
  it('fires photo_comparison_opened on first mount with card_state + touchpoint_count', () => {
    render(
      <PhotoComparisonOpenedCapture
        cardId={CARD_ID}
        cardState="monitoring"
        touchpointCount={3}
      />
    );
    expect(posthogCapture).toHaveBeenCalledWith('photo_comparison_opened', {
      card_state: 'monitoring',
      touchpoint_count: 3,
    });
  });

  it('writes the session-storage sentinel after firing', () => {
    render(
      <PhotoComparisonOpenedCapture
        cardId={CARD_ID}
        cardState="closed"
        touchpointCount={2}
      />
    );
    expect(
      sessionStorage.getItem(`home_os.photo_comparison_opened_fired:${CARD_ID}`)
    ).toBe('1');
  });

  it('does NOT re-fire when the sentinel is already set', () => {
    sessionStorage.setItem(
      `home_os.photo_comparison_opened_fired:${CARD_ID}`,
      '1'
    );
    render(
      <PhotoComparisonOpenedCapture
        cardId={CARD_ID}
        cardState="planned"
        touchpointCount={2}
      />
    );
    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it('fires separately for two different card_ids', () => {
    const OTHER = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    render(
      <PhotoComparisonOpenedCapture
        cardId={CARD_ID}
        cardState="monitoring"
        touchpointCount={2}
      />
    );
    render(
      <PhotoComparisonOpenedCapture
        cardId={OTHER}
        cardState="closed"
        touchpointCount={4}
      />
    );
    expect(posthogCapture).toHaveBeenCalledTimes(2);
  });
});
