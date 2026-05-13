// @vitest-environment happy-dom
// What: Smoke test for CameraPathA. Renders the panel and asserts the
//       capture button + hidden <input capture> exist with correct attrs
//       (D9 — iOS-specific behaviors operator-validated, not jsdom-
//       asserted).
// Why:  The pre-commit test-presence hook requires a paired test per
//       non-trivial source file; this is the minimum that proves the
//       component renders without crashing under jsdom.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }) }),
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { CameraPathA } from './CameraPathA';

const noopEnsureUserId = async () => null;

describe('<CameraPathA />', () => {
  afterEach(() => cleanup());

  it('renders heading + capture button + hidden file input', () => {
    render(<CameraPathA ensureUserId={noopEnsureUserId} />);
    expect(
      screen.getByRole('heading', { level: 2, name: /path a/i })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /capture \(path a\)/i })
    ).toBeTruthy();
    const input = screen.getByLabelText(
      /capture photo \(path a\)/i
    ) as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
  });

  it('renders the idle readout copy before any capture', () => {
    render(<CameraPathA ensureUserId={noopEnsureUserId} />);
    expect(screen.getByText(/no capture yet/i)).toBeTruthy();
  });
});
