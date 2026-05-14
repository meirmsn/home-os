// @vitest-environment happy-dom
// What: Smoke test for /spike/comparison. Asserts the heading, both
//       panels render, the three cadence buttons + bounce toggle + own-
//       photos toggle exist, and the readout cells (cadence / median /
//       p95 / drift) render (D9 — iOS-specific FPS + drift are
//       operator-validated).
// Why:  Layer-1 test-presence pairing. The interactive iOS behaviors
//       live in the result doc, not this test.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
});
vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    storage: {
      from: () => ({
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: 'https://x' } }),
      }),
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import SpikeComparisonPage from './page';

describe('/spike/comparison', () => {
  afterEach(() => cleanup());

  it('renders the heading + both panels + FPS overlay', () => {
    render(<SpikeComparisonPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /spike.*comparison/i })
    ).toBeTruthy();
    expect(screen.getByTestId('panel-left')).toBeTruthy();
    expect(screen.getByTestId('panel-right')).toBeTruthy();
    expect(screen.getByTestId('fps-overlay')).toBeTruthy();
  });

  it('renders the three cadence radio buttons + bounce toggle', () => {
    render(<SpikeComparisonPage />);
    expect(screen.getByRole('radio', { name: /slow/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /default/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /fast/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /start bounce/i })).toBeTruthy();
  });

  it('renders the "Use your own photos" toggle', () => {
    render(<SpikeComparisonPage />);
    expect(screen.getByLabelText(/use your own photos/i)).toBeTruthy();
  });

  it('renders all four readout stats (cadence / median / p95 / drift)', () => {
    render(<SpikeComparisonPage />);
    const readouts = screen.getByTestId('readouts');
    expect(readouts.textContent).toMatch(/cadence/i);
    expect(readouts.textContent).toMatch(/median/i);
    expect(readouts.textContent).toMatch(/p95/i);
    expect(readouts.textContent).toMatch(/drift/i);
  });

  it('defaults to the bundled sample JPEG sources', () => {
    render(<SpikeComparisonPage />);
    const leftImg = screen.getByAltText(
      /left comparison panel/i
    ) as HTMLImageElement;
    expect(leftImg.getAttribute('src')).toContain('/spike/sample-left.jpg');
  });
});
