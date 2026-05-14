// @vitest-environment happy-dom
// What: Smoke test for /spike/camera. Asserts both Path A and Path B
//       panels render with their headings + primary buttons (D9 —
//       page-level tests are thin Layer-1 assertions; the actual iOS
//       behaviors are operator-validated).
// Why:  jsdom doesn't expose `mediaDevices` or a real `<input capture>`
//       camera UI; we cover render and let the operator validate the
//       interactive flow on the Vercel preview.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import SpikeCameraPage from './page';

describe('/spike/camera', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders both Path A and Path B panels with their headings', () => {
    render(<SpikeCameraPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /spike.*camera/i })
    ).toBeTruthy();

    expect(screen.getByTestId('camera-path-a')).toBeTruthy();
    expect(screen.getByTestId('camera-path-b')).toBeTruthy();

    expect(
      screen.getByRole('heading', { level: 2, name: /path a/i })
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: /path b/i })
    ).toBeTruthy();
  });

  it('renders the Path A capture button + Path B start preview button', () => {
    render(<SpikeCameraPage />);

    expect(
      screen.getByRole('button', { name: /capture \(path a\)/i })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /start preview/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /capture frame/i })).toBeTruthy();
  });

  it('renders the hidden file input for Path A with accept + capture attrs', () => {
    render(<SpikeCameraPage />);
    const input = screen.getByLabelText(
      /capture photo \(path a\)/i
    ) as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
  });
});
