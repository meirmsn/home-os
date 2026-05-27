// @vitest-environment happy-dom
// What: Unit tests for UsageBar. Locks the visual contract: count text,
//       progress bar fill, bar color (indigo under limit, terracotta at
//       5/5), reset indicator.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UsageBar } from './UsageBar';

afterEach(() => {
  cleanup();
});

describe('<UsageBar />', () => {
  it('renders the count text "X of 5 sessions used"', () => {
    render(<UsageBar count={3} />);
    expect(screen.getByTestId('usage-count').textContent).toBe(
      '3 of 5 sessions used'
    );
  });

  it('renders progress bar fill at 3/5 (60%)', () => {
    render(<UsageBar count={3} />);
    const fill = screen.getByTestId('usage-bar-fill');
    expect(fill.style.width).toBe('60%');
  });

  it('uses indigo color when under the limit', () => {
    render(<UsageBar count={3} />);
    const fill = screen.getByTestId('usage-bar-fill');
    expect(fill.style.backgroundColor).toBe('var(--color-planned)');
  });

  it('uses terracotta color at 5/5', () => {
    render(<UsageBar count={5} />);
    const fill = screen.getByTestId('usage-bar-fill');
    expect(fill.style.backgroundColor).toBe('var(--color-act-soon)');
  });

  it('renders "Resets Monday" indicator', () => {
    render(<UsageBar count={0} />);
    expect(screen.getByText('Resets Monday')).toBeDefined();
  });

  it('renders "X sessions this week" when hasByokKey is true', () => {
    render(<UsageBar count={7} hasByokKey />);
    expect(screen.getByTestId('usage-count').textContent).toBe(
      '7 sessions this week'
    );
  });

  it('caps the fill width at 100% even if count > 5', () => {
    render(<UsageBar count={8} />);
    const fill = screen.getByTestId('usage-bar-fill');
    expect(fill.style.width).toBe('100%');
  });
});
