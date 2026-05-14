// @vitest-environment happy-dom
// What: Smoke test for CameraPathB. Renders the panel and asserts the
//       Start preview + Capture frame buttons + the <video> preview
//       element exist (D9 — getUserMedia not jsdom-available; operator-
//       validates the stream + capture flow on real iPhone Safari).
// Why:  Test-presence pairing — proves the component renders without
//       crashing under jsdom even with no mediaDevices polyfill.

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

import { CameraPathB } from './CameraPathB';

const noopEnsureUserId = async () => null;

describe('<CameraPathB />', () => {
  afterEach(() => cleanup());

  it('renders heading + start + capture buttons + the video preview', () => {
    render(<CameraPathB ensureUserId={noopEnsureUserId} />);
    expect(
      screen.getByRole('heading', { level: 2, name: /path b/i })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /start preview/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /capture frame/i })).toBeTruthy();
    expect(screen.getByLabelText(/camera preview \(path b\)/i)).toBeTruthy();
  });

  it('disables the capture button before streaming starts', () => {
    render(<CameraPathB ensureUserId={noopEnsureUserId} />);
    const captureBtn = screen.getByRole('button', {
      name: /capture frame/i,
    }) as HTMLButtonElement;
    expect(captureBtn.disabled).toBe(true);
  });
});
