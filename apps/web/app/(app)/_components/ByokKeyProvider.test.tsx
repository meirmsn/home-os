// @vitest-environment happy-dom
// What: Unit tests for ByokKeyProvider. Locks the context contract:
//       initial null, setByokKey updates, clearByokKey resets, throws
//       outside provider.
// Why:  The BYOK key is a security-sensitive value held in memory only.
//       Regressions here (e.g. a key that persists unexpectedly or a
//       context that silently returns undefined instead of throwing)
//       would undermine the security posture.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ByokKeyProvider, useByokKey } from './ByokKeyProvider';

/** Test consumer that renders the context value + exposes setters. */
let setByokKeyRef: (key: string) => void;
let clearByokKeyRef: () => void;

/**
 *
 */
function TestConsumer() {
  const { byokKey, setByokKey, clearByokKey } = useByokKey();
  setByokKeyRef = setByokKey;
  clearByokKeyRef = clearByokKey;
  return <span data-testid="key-value">{byokKey ?? 'null'}</span>;
}

afterEach(() => {
  cleanup();
});

describe('<ByokKeyProvider />', () => {
  it('provides byokKey as null initially', () => {
    render(
      <ByokKeyProvider>
        <TestConsumer />
      </ByokKeyProvider>
    );
    expect(screen.getByTestId('key-value').textContent).toBe('null');
  });

  it('setByokKey updates the context value', () => {
    render(
      <ByokKeyProvider>
        <TestConsumer />
      </ByokKeyProvider>
    );
    act(() => setByokKeyRef('sk-ant-test'));
    expect(screen.getByTestId('key-value').textContent).toBe('sk-ant-test');
  });

  it('clearByokKey resets the context value to null', () => {
    render(
      <ByokKeyProvider>
        <TestConsumer />
      </ByokKeyProvider>
    );
    act(() => setByokKeyRef('sk-ant-test'));
    expect(screen.getByTestId('key-value').textContent).toBe('sk-ant-test');
    act(() => clearByokKeyRef());
    expect(screen.getByTestId('key-value').textContent).toBe('null');
  });

  it('throws when useByokKey is used outside ByokKeyProvider', () => {
    // Suppress React's error boundary console output.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useByokKey must be used within a ByokKeyProvider'
    );
    spy.mockRestore();
  });
});
