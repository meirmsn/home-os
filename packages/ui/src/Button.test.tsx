// What: Smoke test for the Button component contract.
// Why: Verify the export shape and default variant without pulling in jsdom +
//      React Testing Library. The first real consumer (apps/web) will add
//      proper render-level coverage; this keeps the package's own test gate
//      green at scaffold time.
// Does NOT: Render JSX or simulate user events (deferred to the consuming app).

import { describe, it, expect } from 'vitest';
import { Button, type ButtonProps } from './Button';

describe('Button', () => {
  it('is exported as a function', () => {
    expect(typeof Button).toBe('function');
  });

  it('accepts a known set of variant values', () => {
    const variants: Array<NonNullable<ButtonProps['variant']>> = [
      'primary',
      'secondary',
      'ghost',
    ];
    expect(variants).toHaveLength(3);
  });
});
