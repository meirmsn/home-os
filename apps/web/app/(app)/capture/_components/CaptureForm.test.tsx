// @vitest-environment happy-dom
// What: Unit tests for <CaptureForm />. Covers: capture_started fires
//       exactly once on mount (D9 + ref guard); submit-disabled until
//       required fields are valid (D6); 201 path fires capture_completed
//       with the right payload and routes to /home (D9); 429 path swaps
//       Submit for the cap-hit banner, fires capture_cap_hit, and
//       preserves form state (D11); photo selection renders preview +
//       byte size (D5); generic network error surfaces the recover
//       copy without dropping form state.
// Why:  The form is the user-facing trust boundary for capture-flow;
//       these branches are the contract.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const { capture, captureException, routerPush, routerRefresh } = vi.hoisted(
  () => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    routerPush: vi.fn(),
    routerRefresh: vi.fn(),
  })
);

vi.mock('@/lib/posthog', () => ({
  posthog: { capture },
  initPostHog: () => ({ capture }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

// crypto.randomUUID may not exist on happy-dom's default crypto stub.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...globalThis.crypto,
      randomUUID: () => '00000000-1111-2222-3333-444444444444',
    },
  });
}

// URL.createObjectURL doesn't exist on happy-dom by default.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock';
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined;
}

import { CaptureForm } from './CaptureForm';

/** Fill the three required fields with valid values. */
function fillRequired() {
  fireEvent.change(screen.getByLabelText(/what.s going on/i), {
    target: { value: 'Leaky faucet under the sink for two days.' },
  });
  fireEvent.change(screen.getByLabelText(/system/i), {
    target: { value: 'plumbing' },
  });
  fireEvent.change(screen.getByLabelText(/room/i), {
    target: { value: 'Kitchen' },
  });
}

beforeEach(() => {
  capture.mockReset();
  captureException.mockReset();
  routerPush.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<CaptureForm />', () => {
  it('fires capture_started exactly once on mount (ref-guarded)', () => {
    const { rerender } = render(<CaptureForm />);
    rerender(<CaptureForm />);
    const startedCalls = capture.mock.calls.filter(
      ([event]) => event === 'capture_started'
    );
    expect(startedCalls).toHaveLength(1);
  });

  it('keeps Submit disabled until all three required fields are valid', () => {
    render(<CaptureForm />);
    const submit = screen.getByRole('button', {
      name: 'Save card',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/what.s going on/i), {
      target: { value: 'Just description' },
    });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/system/i), {
      target: { value: 'plumbing' },
    });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/room/i), {
      target: { value: 'Kitchen' },
    });
    expect(submit.disabled).toBe(false);
  });

  it('on 201: fires capture_completed with the right payload and routes to /home', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({
        card_id: 'c-1',
        card_count_after: 1,
        photo_uploaded: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CaptureForm />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/home'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/card',
      expect.objectContaining({ method: 'POST' })
    );
    const completed = capture.mock.calls.find(
      ([event]) => event === 'capture_completed'
    );
    expect(completed).toBeTruthy();
    expect(completed?.[1]).toEqual({
      has_photo: false,
      system_tag: 'plumbing',
      room_tag_length: 'Kitchen'.length,
      is_update: false,
    });
  });

  it('on 429: fires capture_cap_hit, swaps Submit for banner, preserves form state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 429,
      json: async () => ({
        error: 'card_cap_reached',
        resets_on: '2026-05-18',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CaptureForm />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    // Wait for the cap-hit banner text (definitive end-state) rather than
    // the Submit button's transient "Save card" → "Saving…" → gone shape,
    // which can race a waitFor that polls before stage flips back to idle.
    await waitFor(() =>
      expect(screen.getByText(/20 issues this week/i)).toBeTruthy()
    );
    expect(screen.queryByRole('button', { name: 'Save card' })).toBeNull();
    // Form state preserved.
    expect(
      (screen.getByLabelText(/what.s going on/i) as HTMLTextAreaElement).value
    ).toContain('Leaky faucet');
    expect((screen.getByLabelText(/room/i) as HTMLInputElement).value).toBe(
      'Kitchen'
    );
    const capHit = capture.mock.calls.find(
      ([event]) => event === 'capture_cap_hit'
    );
    expect(capHit?.[1]).toEqual({ resets_on: '2026-05-18' });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('renders a preview thumbnail and byte size after a photo is selected', async () => {
    render(<CaptureForm />);
    const fileInput = screen.getByLabelText(/photo/i) as HTMLInputElement;
    const photo = new File([new Uint8Array(2048).fill(0xff)], 'p.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(fileInput, { target: { files: [photo] } });
    await waitFor(() => screen.getByAltText('Selected'));
    expect(screen.getByText(/2 KB/i)).toBeTruthy();
  });

  it('on network error: shows a generic recover copy and keeps form state intact', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    render(<CaptureForm />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() =>
      expect(screen.getByText(/couldn.t save/i)).toBeTruthy()
    );
    expect(captureException).toHaveBeenCalled();
    // Form state preserved.
    expect(
      (screen.getByLabelText(/what.s going on/i) as HTMLTextAreaElement).value
    ).toContain('Leaky faucet');
  });

  it('Update existing toggle shows the non-blocking notice and hides the form', () => {
    render(<CaptureForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Update existing' }));
    expect(
      screen.getByText(/updating existing cards ships in the next release/i)
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save card' })).toBeNull();
  });
});
