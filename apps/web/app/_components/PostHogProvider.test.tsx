// What: Smoke test for the PostHogProvider export shape.
// Why:  Render-level coverage requires jsdom + @testing-library/react, which
//       this package doesn't yet pull in (see packages/ui/src/Button.test.tsx
//       § precedent). The first consumer that needs DOM-level coverage will
//       introduce jsdom; until then a shape check protects against accidental
//       export removal or signature drift.
// Does NOT: Mount the component, invoke effects, or assert child rendering.

import { describe, expect, it } from 'vitest';

import { PostHogProvider } from './PostHogProvider';

describe('PostHogProvider', () => {
  it('is exported as a function', () => {
    expect(typeof PostHogProvider).toBe('function');
  });
});
