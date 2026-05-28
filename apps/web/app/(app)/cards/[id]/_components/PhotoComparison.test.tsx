// What: Unit tests for <PhotoComparison>. Covers the screenshot-ready layout
//       (issue name, both dates, wordmark, both panels) and the default pair
//       (A = earliest, B = latest).
// Why:  spec § Tests § PhotoComparison.test.tsx — pin the layout contract and
//       the earliest<->latest default. Gesture math is covered by
//       compare/_lib/sync-zoom-transform.test.ts (the pure module).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhotoComparison } from './PhotoComparison';
import type { CompareTouchpoint } from '../compare/_lib/group-touchpoints';

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
