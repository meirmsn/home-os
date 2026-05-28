// What: Unit tests for <PhotoComparison>. Covers the screenshot-ready layout
//       (issue name, both dates, wordmark, both panels) and the default pair
//       (A = earliest, B = latest).
// Why:  spec § Tests § PhotoComparison.test.tsx — pin the layout contract and
//       the earliest<->latest default. Gesture math is covered by
//       compare/_lib/sync-zoom-transform.test.ts (the pure module).

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { CompareTouchpoint } from '../compare/_lib/group-touchpoints';

// The PostHog capture component is unit-tested separately; stub it here so
// these layout/interaction tests don't depend on posthog-js init.
vi.mock('./PhotoComparisonOpenedCapture', () => ({
  PhotoComparisonOpenedCapture: () => null,
}));

import { PhotoComparison } from './PhotoComparison';

const TP = (
  id: string,
  date: string,
  photos: CompareTouchpoint['photos'],
  type: CompareTouchpoint['type'] = 'primary'
): CompareTouchpoint => ({ id, date, type, photos });

const touchpoints: CompareTouchpoint[] = [
  TP('tp-early', '2026-05-01T08:00:00Z', { wide: 'url://a-wide' }, 'primary'),
  TP('tp-mid', '2026-05-10T08:00:00Z', { wide: 'url://m-wide' }, 'checkin'),
  TP('tp-late', '2026-05-20T08:00:00Z', { wide: 'url://b-wide' }, 'close'),
];

/**
 *
 */
function renderComponent(tps = touchpoints) {
  return render(
    <PhotoComparison
      cardId="card-1"
      issueName="Leaky faucet"
      cardState="monitoring"
      touchpoints={tps}
    />
  );
}

afterEach(() => cleanup());

describe('<PhotoComparison> layout', () => {
  it('renders the issue name', () => {
    renderComponent();
    expect(screen.getByTestId('compare-issue-name').textContent).toBe(
      'Leaky faucet'
    );
  });

  it('renders the Home OS wordmark', () => {
    renderComponent();
    expect(screen.getByTestId('compare-wordmark').textContent).toContain(
      'Home OS'
    );
  });

  it('renders both photo panels with the back link', () => {
    renderComponent();
    expect(screen.getByTestId('compare-panel-a')).toBeTruthy();
    expect(screen.getByTestId('compare-panel-b')).toBeTruthy();
    expect(screen.getByTestId('compare-back-link').getAttribute('href')).toBe(
      '/cards/card-1'
    );
  });

  it('defaults the pair to earliest (A) <-> latest (B)', () => {
    renderComponent();
    // A = earliest touchpoint photo, B = latest.
    expect(screen.getByTestId('compare-img-a').getAttribute('src')).toBe(
      'url://a-wide'
    );
    expect(screen.getByTestId('compare-img-b').getAttribute('src')).toBe(
      'url://b-wide'
    );
    // Dates below each panel reflect the same pair.
    expect(screen.getByTestId('compare-date-a').textContent).toContain('May 1');
    expect(screen.getByTestId('compare-date-b').textContent).toContain(
      'May 20'
    );
  });

  it('sets touch-action:none on the panels (PWA scoping — spec G1)', () => {
    renderComponent();
    const panelA = screen.getByTestId('compare-panel-a');
    expect(panelA.style.touchAction).toBe('none');
  });
});

describe('<PhotoComparison> bounce + cadence', () => {
  it('toggles bounceOn via the Bounce/Stop button', () => {
    renderComponent();
    const toggle = screen.getByTestId('compare-bounce-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toBe('Bounce');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('Stop');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('defaults cadence to 750 ms and switches on click', () => {
    renderComponent();
    expect(
      screen.getByTestId('compare-cadence-750').getAttribute('aria-checked')
    ).toBe('true');
    fireEvent.click(screen.getByTestId('compare-cadence-400'));
    expect(
      screen.getByTestId('compare-cadence-400').getAttribute('aria-checked')
    ).toBe('true');
    expect(
      screen.getByTestId('compare-cadence-750').getAttribute('aria-checked')
    ).toBe('false');
  });

  it('exposes all three cadence options mapped to 1200/750/400', () => {
    renderComponent();
    expect(screen.getByTestId('compare-cadence-1200').textContent).toBe('Slow');
    expect(screen.getByTestId('compare-cadence-750').textContent).toBe(
      'Default'
    );
    expect(screen.getByTestId('compare-cadence-400').textContent).toBe('Fast');
  });

  it('enables bounce when both panels have the slot', () => {
    renderComponent();
    expect(
      screen.getByTestId('compare-bounce-toggle').hasAttribute('disabled')
    ).toBe(false);
    expect(screen.queryByTestId('compare-bounce-hint')).toBeNull();
  });

  it('disables bounce + shows the hint when a panel lacks the slot', () => {
    // B (latest) has no wide photo -> bounce disabled.
    const tps: CompareTouchpoint[] = [
      TP('tp-early', '2026-05-01T08:00:00Z', { wide: 'url://a-wide' }),
      TP('tp-late', '2026-05-20T08:00:00Z', { medium: 'url://b-medium' }),
    ];
    renderComponent(tps);
    expect(
      screen.getByTestId('compare-bounce-toggle').hasAttribute('disabled')
    ).toBe(true);
    expect(screen.getByTestId('compare-bounce-hint')).toBeTruthy();
  });
});

describe('<PhotoComparison> date + slot pickers', () => {
  // A has all three slots; B (latest) has only wide.
  const multiSlot: CompareTouchpoint[] = [
    TP(
      'tp-early',
      '2026-05-01T08:00:00Z',
      {
        wide: 'url://a-wide',
        medium: 'url://a-medium',
        closeup: 'url://a-close',
      },
      'primary'
    ),
    TP('tp-mid', '2026-05-10T08:00:00Z', { wide: 'url://m-wide' }, 'checkin'),
    TP('tp-late', '2026-05-20T08:00:00Z', { wide: 'url://b-wide' }, 'close'),
  ];

  it('defaults the slot selector to wide', () => {
    renderComponent(multiSlot);
    expect(
      screen.getByTestId('compare-slot-wide').getAttribute('aria-checked')
    ).toBe('true');
  });

  it('switching to a slot a date lacks shows the missing-slot placeholder for that panel only', () => {
    renderComponent(multiSlot);
    // Switch to medium: A has it, B (latest) does not.
    fireEvent.click(screen.getByTestId('compare-slot-medium'));
    expect(screen.getByTestId('compare-img-a').getAttribute('src')).toBe(
      'url://a-medium'
    );
    // B panel shows the placeholder, not an image.
    expect(screen.queryByTestId('compare-img-b')).toBeNull();
    expect(screen.getByTestId('compare-missing-b').textContent).toContain(
      'No photo for this slot'
    );
  });

  it('disables bounce while a panel is in the missing-slot state', () => {
    renderComponent(multiSlot);
    expect(
      screen.getByTestId('compare-bounce-toggle').hasAttribute('disabled')
    ).toBe(false);
    fireEvent.click(screen.getByTestId('compare-slot-closeup'));
    // B lacks closeup -> bounce disabled.
    expect(
      screen.getByTestId('compare-bounce-toggle').hasAttribute('disabled')
    ).toBe(true);
  });

  it('enforces distinct selection by disabling the sibling option in each picker', () => {
    renderComponent(multiSlot);
    const pickerA = screen.getByTestId(
      'compare-date-picker-a'
    ) as HTMLSelectElement;
    const pickerB = screen.getByTestId(
      'compare-date-picker-b'
    ) as HTMLSelectElement;
    // A defaults to tp-early, B to tp-late. In picker A, the tp-late option is
    // disabled (it's B's selection); in picker B, tp-early is disabled.
    const aLateOption = [...pickerA.options].find((o) => o.value === 'tp-late');
    const bEarlyOption = [...pickerB.options].find(
      (o) => o.value === 'tp-early'
    );
    expect(aLateOption?.disabled).toBe(true);
    expect(bEarlyOption?.disabled).toBe(true);
  });

  it('changing date A swaps that panel to the new touchpoint photo', () => {
    renderComponent(multiSlot);
    fireEvent.change(screen.getByTestId('compare-date-picker-a'), {
      target: { value: 'tp-mid' },
    });
    expect(screen.getByTestId('compare-img-a').getAttribute('src')).toBe(
      'url://m-wide'
    );
    expect(screen.getByTestId('compare-date-a').textContent).toContain(
      'May 10'
    );
  });

  it('falls back to the missing-slot placeholder when an image errors (expired URL — G9)', () => {
    renderComponent(multiSlot);
    const imgA = screen.getByTestId('compare-img-a');
    fireEvent.error(imgA);
    expect(screen.queryByTestId('compare-img-a')).toBeNull();
    expect(screen.getByTestId('compare-missing-a')).toBeTruthy();
  });
});

describe('<PhotoComparison> bounce frame-swap', () => {
  // Deterministic rAF + performance.now driver. The component's bounce loop
  // (PhotoComparison.tsx:154-171) reads performance.now() for `lastSwap` and
  // compares each rAF callback's `now` arg against it, swapping the frame when
  // `now - lastSwap >= cadenceMs`. We capture the rAF callback and a virtual
  // clock so the instant-cut alternation is driven by us, not wall-clock.
  /**
   *
   */
  function installRafClock() {
    let now = 0;
    let pending: FrameRequestCallback | null = null;
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        pending = cb;
        return 1;
      });
    const cancelSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => {
        pending = null;
      });
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    // Advance the virtual clock by `ms` and fire one rAF tick at the new time.
    /**
     *
     */
    function advance(ms: number) {
      now += ms;
      const cb = pending;
      if (cb) {
        act(() => cb(now));
      }
    }
    /**
     *
     */
    function restore() {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
      nowSpy.mockRestore();
    }
    return { advance, restore };
  }

  it('alternates both panels A<->B on the cadence interval while bouncing (instant cut — D1)', () => {
    const clock = installRafClock();
    try {
      renderComponent();
      const imgA = () =>
        screen.getByTestId('compare-img-a').getAttribute('src');
      const imgB = () =>
        screen.getByTestId('compare-img-b').getAttribute('src');

      // Pre-bounce: each panel shows its own date's photo.
      expect(imgA()).toBe('url://a-wide');
      expect(imgB()).toBe('url://b-wide');

      // Turn bounce ON. Frame 0 -> both panels show A's photo (instant-cut,
      // both panels share the alternating frame so the change "jumps out").
      act(() => {
        fireEvent.click(screen.getByTestId('compare-bounce-toggle'));
      });
      expect(imgA()).toBe('url://a-wide');
      expect(imgB()).toBe('url://a-wide');

      // Below the default 750ms cadence: no swap yet.
      clock.advance(700);
      expect(imgA()).toBe('url://a-wide');
      expect(imgB()).toBe('url://a-wide');

      // Crossing the 750ms threshold (cumulative 750) flips to frame 1 -> both
      // panels now show B's photo.
      clock.advance(60);
      expect(imgA()).toBe('url://b-wide');
      expect(imgB()).toBe('url://b-wide');

      // Another cadence interval flips back to frame 0 -> A again.
      clock.advance(750);
      expect(imgA()).toBe('url://a-wide');
      expect(imgB()).toBe('url://a-wide');
    } finally {
      clock.restore();
    }
  });

  it('keeps the shared zoom transform across a bounce frame swap (bounce respects zoom — Bounce mode)', () => {
    const clock = installRafClock();
    try {
      renderComponent();
      const panelA = screen.getByTestId('compare-panel-a');

      // Pinch to zoom: spread two pointers from 100px apart to 200px apart ->
      // scale 2 (pinchToScale ratio 200/100). Origin stays {0,0} so the panel
      // recenters; the transform string is the contract we pin.
      act(() => {
        fireEvent.pointerDown(panelA, {
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        });
        fireEvent.pointerDown(panelA, {
          pointerId: 2,
          clientX: 200,
          clientY: 100,
        });
        fireEvent.pointerMove(panelA, {
          pointerId: 1,
          clientX: 50,
          clientY: 100,
        });
        fireEvent.pointerMove(panelA, {
          pointerId: 2,
          clientX: 250,
          clientY: 100,
        });
      });
      const zoomed = (screen.getByTestId('compare-img-a') as HTMLElement).style
        .transform;
      expect(zoomed).toContain('scale(2)');

      // Enable bounce and confirm the swap actually happens (src changes) while
      // the transform is unchanged before AND after the swap.
      act(() => {
        fireEvent.click(screen.getByTestId('compare-bounce-toggle'));
      });
      const beforeSwap = screen.getByTestId('compare-img-a') as HTMLElement;
      expect(beforeSwap.style.transform).toBe(zoomed);
      expect(beforeSwap.getAttribute('src')).toBe('url://a-wide');

      // Drive one cadence interval -> frame swaps to B's photo.
      clock.advance(750);
      const afterSwap = screen.getByTestId('compare-img-a') as HTMLElement;
      expect(afterSwap.getAttribute('src')).toBe('url://b-wide');
      // The {scale, origin} transform survives the instant cut untouched.
      expect(afterSwap.style.transform).toBe(zoomed);
    } finally {
      clock.restore();
    }
  });
});
