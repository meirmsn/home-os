// What: Proof-of-concept Button component for @home-os/ui.
// Why: Anchor a typed, accessible primitive in the shared UI package so the
//      first real feature has somewhere to import from and the convention
//      (typed variant prop, native button passthrough) is set on day one.
// Does NOT: Style itself with Tailwind — colors come from tokens.ts at the
//           call site; Tailwind classes can be passed via `className` for now.

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

/**
 * Accessible button primitive. `variant` selects the visual treatment;
 * everything else passes through to the native `<button>`.
 */
export function Button({
  variant = 'primary',
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      data-variant={variant}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}
