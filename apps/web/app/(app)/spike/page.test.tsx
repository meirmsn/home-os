// @vitest-environment happy-dom
// What: Smoke test for /spike landing page. Asserts the orientation
//       paragraph + both internal links + the result-doc gate reminder
//       render (D9 — page-level tests are thin Layer-1 assertions).
// Why:  Page is a tiny server component, but the test fixes the link
//       targets so a typo in `/spike/camera` or `/spike/comparison`
//       can't ship.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

// next/link renders an <a> in the DOM; no mock needed under happy-dom.
import SpikeLandingPage from './page';

describe('/spike landing', () => {
  it('renders the orientation paragraph + both sub-page links + gate reminder', () => {
    render(<SpikeLandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /pwa spike/i })
    ).toBeTruthy();

    const cameraLink = screen.getByRole('link', { name: /\/spike\/camera/i });
    expect(cameraLink.getAttribute('href')).toBe('/spike/camera');

    const comparisonLink = screen.getByRole('link', {
      name: /\/spike\/comparison/i,
    });
    expect(comparisonLink.getAttribute('href')).toBe('/spike/comparison');

    expect(screen.getByText(/result-doc gate/i)).toBeTruthy();
    expect(screen.getByText(/RESULTS-PENDING: no/)).toBeTruthy();
  });
});
