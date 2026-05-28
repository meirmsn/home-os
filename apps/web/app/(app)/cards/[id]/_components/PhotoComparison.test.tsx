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
