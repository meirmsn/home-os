// @vitest-environment happy-dom
// What: Smoke test for ComparisonPanels. Asserts both panels render
//       with `touch-action: none` and FPS overlay is present (D5 —
//       iOS-specific FPS + cadence-drift behaviors are operator-
//       validated under spec D9).
// Why:  Test-presence pairing — proves the component renders without
//       crashing under jsdom and the touch-action gotcha is enforced
//       on the panels (NOT on document/body).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// rAF in happy-dom calls back synchronously enough for our smoke test,
// but stub it deterministically so the bounce loop doesn't fire and
// invalidate setTimeout-based timers.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
});
vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));

import { ComparisonPanels } from './ComparisonPanels';

const NOOP_TIMESTAMP = () => {};

describe('<ComparisonPanels />', () => {
  afterEach(() => cleanup());

  it('renders both panels with touch-action: none', () => {
    render(
      <ComparisonPanels
        leftSrc="/spike/sample-left.jpg"
        rightSrc="/spike/sample-right.jpg"
        cadence={750}
        bouncing={false}
        onTimestamp={NOOP_TIMESTAMP}
        bounds={{ width: 400, height: 300 }}
      />
    );

    const left = screen.getByTestId('panel-left');
    const right = screen.getByTestId('panel-right');

    expect((left.style as CSSStyleDeclaration).touchAction).toBe('none');
    expect((right.style as CSSStyleDeclaration).touchAction).toBe('none');
  });

  it('renders the FPS overlay', () => {
    render(
      <ComparisonPanels
        leftSrc="/spike/sample-left.jpg"
        rightSrc="/spike/sample-right.jpg"
        cadence={750}
        bouncing={false}
        onTimestamp={NOOP_TIMESTAMP}
        bounds={{ width: 400, height: 300 }}
      />
    );
    expect(screen.getByTestId('fps-overlay')).toBeTruthy();
  });

  it('renders the two photos with their alt text', () => {
    render(
      <ComparisonPanels
        leftSrc="/spike/sample-left.jpg"
        rightSrc="/spike/sample-right.jpg"
        cadence={750}
        bouncing={false}
        onTimestamp={NOOP_TIMESTAMP}
        bounds={{ width: 400, height: 300 }}
      />
    );
    expect(screen.getByAltText(/left comparison panel/i)).toBeTruthy();
    expect(screen.getByAltText(/right comparison panel/i)).toBeTruthy();
  });

  it('renders a bounce overlay <img> on each panel when bouncing', () => {
    render(
      <ComparisonPanels
        leftSrc="/spike/sample-left.jpg"
        rightSrc="/spike/sample-right.jpg"
        cadence={750}
        bouncing={true}
        onTimestamp={NOOP_TIMESTAMP}
        bounds={{ width: 400, height: 300 }}
      />
    );
    expect(screen.getByAltText(/bounce overlay.*right photo/i)).toBeTruthy();
    expect(screen.getByAltText(/bounce overlay.*left photo/i)).toBeTruthy();
  });
});
