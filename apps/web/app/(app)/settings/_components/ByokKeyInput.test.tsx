// @vitest-environment happy-dom
// What: Unit tests for ByokKeyInput. Locks the two-state UI (State A
//       first-time with explainer, State B returning without), inline
//       validation feedback, PostHog event firing, and loading state.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ByokKeyProvider } from '@/app/(app)/_components/ByokKeyProvider';
import { ByokKeyInput } from './ByokKeyInput';

// Mock PostHog
const { captureMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
}));

vi.mock('@/lib/posthog', () => ({
  posthog: { capture: captureMock },
}));

// Mock fetch
const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  captureMock.mockReset();
  globalThis.fetch = originalFetch;
});

/**
 * Render helper that wraps ByokKeyInput in ByokKeyProvider.
 */
function renderInput(props: { byokUsed: boolean }) {
  return render(
    <ByokKeyProvider>
      <ByokKeyInput {...props} />
    </ByokKeyProvider>
  );
}

describe('<ByokKeyInput />', () => {
  it('State A: renders explainer paragraph when byokUsed=false', () => {
    renderInput({ byokUsed: false });
    expect(screen.getByTestId('byok-explainer')).toBeDefined();
    expect(screen.getByText(/console\.anthropic\.com/)).toBeDefined();
  });

  it('State B: hides explainer paragraph when byokUsed=true', () => {
    renderInput({ byokUsed: true });
    expect(screen.queryByTestId('byok-explainer')).toBeNull();
  });

  it('renders input field and validate button', () => {
    renderInput({ byokUsed: false });
    expect(screen.getByTestId('byok-input')).toBeDefined();
    expect(screen.getByTestId('byok-validate')).toBeDefined();
  });

  it('disables validate button when input is empty', () => {
    renderInput({ byokUsed: false });
    const btn = screen.getByTestId('byok-validate') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows "Key accepted" on successful validation + fires PostHog event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    });

    renderInput({ byokUsed: false });
    const input = screen.getByTestId('byok-input');
    const btn = screen.getByTestId('byok-validate');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-ant-test' } });
    });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('byok-feedback').textContent).toBe(
        'Key accepted'
      );
    });
    expect(captureMock).toHaveBeenCalledWith('byok_key_validated', {});
  });

  it('shows invalid_key error message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: 'invalid_key' }),
    });

    renderInput({ byokUsed: true });
    const input = screen.getByTestId('byok-input');
    const btn = screen.getByTestId('byok-validate');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-ant-bad' } });
    });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('byok-feedback').textContent).toContain(
        "Key didn't work"
      );
    });
  });

  it('shows out_of_credits error with billing link', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: 'out_of_credits' }),
    });

    renderInput({ byokUsed: true });
    const input = screen.getByTestId('byok-input');
    const btn = screen.getByTestId('byok-validate');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-ant-nocredit' } });
    });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      const feedback = screen.getByTestId('byok-feedback');
      expect(feedback.textContent).toContain('out of credits');
      const link = feedback.querySelector('a');
      expect(link?.href).toContain('console.anthropic.com/settings/billing');
    });
  });

  it('shows network error on fetch throw', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));

    renderInput({ byokUsed: false });
    const input = screen.getByTestId('byok-input');
    const btn = screen.getByTestId('byok-validate');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-ant-test' } });
    });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('byok-feedback').textContent).toContain(
        "Couldn't validate"
      );
    });
  });

  it('shows "Validating..." during validation and disables button', async () => {
    let resolvePromise: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    globalThis.fetch = vi.fn().mockReturnValue(fetchPromise);

    renderInput({ byokUsed: false });
    const input = screen.getByTestId('byok-input');
    const btn = screen.getByTestId('byok-validate') as HTMLButtonElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-ant-test' } });
    });

    // Don't await the click — we want to check intermediate state
    act(() => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(btn.textContent).toBe('Validating...');
      expect(btn.disabled).toBe(true);
    });

    // Clean up by resolving
    await act(async () => {
      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({ valid: true }),
      });
    });
  });
});
