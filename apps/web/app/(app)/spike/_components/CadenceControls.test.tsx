// @vitest-environment happy-dom
// What: Smoke test for CadenceControls. Asserts the three cadence radio
//       buttons + the bounce toggle + the "use your own photos"
//       checkbox render and dispatch the correct callbacks.
// Why:  Control strip is the operator's primary input on the comparison
//       surface; pinning the dispatch behavior prevents silent
//       regressions in the cadence wiring.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CADENCES, CadenceControls } from './CadenceControls';

const noop = () => {};

describe('<CadenceControls />', () => {
  afterEach(() => cleanup());

  it('renders all three cadence buttons with the spec-pinned labels', () => {
    render(
      <CadenceControls
        cadence={750}
        onCadenceChange={noop}
        bouncing={false}
        onBouncingChange={noop}
        useOwnPhotos={false}
        onUseOwnPhotosChange={noop}
        ownPhotosAvailable={false}
      />
    );

    for (const c of CADENCES) {
      expect(screen.getByRole('radio', { name: c.label })).toBeTruthy();
    }
  });

  it('marks the active cadence aria-checked=true', () => {
    render(
      <CadenceControls
        cadence={400}
        onCadenceChange={noop}
        bouncing={false}
        onBouncingChange={noop}
        useOwnPhotos={false}
        onUseOwnPhotosChange={noop}
        ownPhotosAvailable={false}
      />
    );

    const fast = screen.getByRole('radio', { name: /fast/i });
    expect(fast.getAttribute('aria-checked')).toBe('true');
  });

  it('dispatches onCadenceChange when a cadence radio is clicked', () => {
    const onCadenceChange = vi.fn();
    render(
      <CadenceControls
        cadence={750}
        onCadenceChange={onCadenceChange}
        bouncing={false}
        onBouncingChange={noop}
        useOwnPhotos={false}
        onUseOwnPhotosChange={noop}
        ownPhotosAvailable={false}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /slow/i }));
    expect(onCadenceChange).toHaveBeenCalledWith(1200);
  });

  it('toggles between Start bounce / Stop bounce labels via aria-pressed', () => {
    const onBouncingChange = vi.fn();
    const { rerender } = render(
      <CadenceControls
        cadence={750}
        onCadenceChange={noop}
        bouncing={false}
        onBouncingChange={onBouncingChange}
        useOwnPhotos={false}
        onUseOwnPhotosChange={noop}
        ownPhotosAvailable={false}
      />
    );

    const start = screen.getByRole('button', { name: /start bounce/i });
    expect(start.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(start);
    expect(onBouncingChange).toHaveBeenCalledWith(true);

    rerender(
      <CadenceControls
        cadence={750}
        onCadenceChange={noop}
        bouncing={true}
        onBouncingChange={onBouncingChange}
        useOwnPhotos={false}
        onUseOwnPhotosChange={noop}
        ownPhotosAvailable={false}
      />
    );

    expect(screen.getByRole('button', { name: /stop bounce/i })).toBeTruthy();
  });

  it('renders the empty-state hint when own-photos toggled on but none available', () => {
    render(
      <CadenceControls
        cadence={750}
        onCadenceChange={noop}
        bouncing={false}
        onBouncingChange={noop}
        useOwnPhotos={true}
        onUseOwnPhotosChange={noop}
        ownPhotosAvailable={false}
      />
    );

    expect(
      screen.getByText(/no uploads yet — visit \/spike\/camera/i)
    ).toBeTruthy();
  });
});
