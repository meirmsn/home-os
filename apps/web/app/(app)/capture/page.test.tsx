// @vitest-environment happy-dom
// What: Unit test for the /(app)/capture page server shell. Asserts the
//       two branches: default (no cardId) renders the form heading; with
//       `?cardId=<uuid>` renders the deferred-update notice (D4).
// Why:  Page is the smallest possible RSC wrapper around the form; lock
//       its routing branch contract.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(() => cleanup());

// Mock the CaptureForm child so the page test stays focused on routing
// branches and doesn't need to set up posthog / fetch / next/navigation.
vi.mock('./_components/CaptureForm', () => ({
  CaptureForm: () => <div data-testid="capture-form-mock">[form]</div>,
}));

import CapturePage from './page';

describe('/(app)/capture page', () => {
  it('renders <CaptureForm /> when there is no cardId search param', async () => {
    const element = await CapturePage({
      searchParams: Promise.resolve({}),
    });
    render(element);
    expect(screen.getByTestId('capture-form-mock')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Capture an issue' })
    ).toBeTruthy();
  });

  it('renders the deferred-update notice when ?cardId=<uuid> is set', async () => {
    const element = await CapturePage({
      searchParams: Promise.resolve({ cardId: 'abc-123' }),
    });
    render(element);
    expect(screen.queryByTestId('capture-form-mock')).toBeNull();
    expect(
      screen.getByText(/updating existing cards ships in the next release/i)
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'create a new card' })
    ).toBeTruthy();
  });
});
