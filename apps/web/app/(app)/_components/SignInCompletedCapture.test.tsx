// @vitest-environment happy-dom
// What: Unit tests for the SignInCompletedCapture client component. Locks
//       the three behaviors that matter (D7, spec § Gotchas):
//         1. identify-before-capture so the event lands on the user's
//            distinct_id, not the pre-sign-in anonymous one.
//         2. sessionStorage guard keyed on user.id — re-mount on the same
//            session is a no-op; remount with a different user.id refires.
//         3. Failing sessionStorage (private mode, throw on get/set) is
//            swallowed silently — the capture is best-effort.
// Why:  The capture is the bottom-of-funnel signal for sign-in conversion.
//       A regression that double-fired (no guard) or under-fired (capture
//       before identify) would skew the funnel without an obvious smoke.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { identify, capture } = vi.hoisted(() => ({
  identify: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/posthog', () => ({
  posthog: { identify, capture },
  initPostHog: () => ({ identify, capture }),
}));

import { SignInCompletedCapture } from './SignInCompletedCapture';

describe('<SignInCompletedCapture />', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    identify.mockReset();
    capture.mockReset();
  });

  it('identifies first, then captures sign_in_completed', () => {
    render(<SignInCompletedCapture userId="u-1" email="a@b.test" />);
    expect(identify).toHaveBeenCalledWith('u-1', { email: 'a@b.test' });
    expect(capture).toHaveBeenCalledWith('sign_in_completed', {
      method: 'magic_link',
    });
    // identify-before-capture (D7, spec § Gotchas)
    const identifyOrder = identify.mock.invocationCallOrder[0]!;
    const captureOrder = capture.mock.invocationCallOrder[0]!;
    expect(identifyOrder).toBeLessThan(captureOrder);
  });

  it('does NOT re-fire on a remount with the same user.id (sessionStorage guard)', () => {
    const { unmount } = render(
      <SignInCompletedCapture userId="u-1" email="a@b.test" />
    );
    expect(capture).toHaveBeenCalledTimes(1);
    unmount();
    render(<SignInCompletedCapture userId="u-1" email="a@b.test" />);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('DOES re-fire when user.id changes (fresh sign-in after sign-out)', () => {
    render(<SignInCompletedCapture userId="u-1" email="a@b.test" />);
    cleanup();
    render(<SignInCompletedCapture userId="u-2" email="c@d.test" />);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(identify).toHaveBeenLastCalledWith('u-2', { email: 'c@d.test' });
  });

  it('swallows sessionStorage failures (private mode) without throwing', () => {
    const getSpy = vi
      .spyOn(window.sessionStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    expect(() => {
      render(<SignInCompletedCapture userId="u-1" email="a@b.test" />);
    }).not.toThrow();
    getSpy.mockRestore();
  });
});
