// What: Typed design tokens for @home-os/ui.
// Why: TypeScript source of truth for runtime references (e.g.
//      `style={{ color: colors.text.primary }}`). Tailwind v4 reads its tokens
//      from CSS `@theme` in apps/web/globals.css — keep the two in sync at the
//      naming level (a token added here gets a matching CSS variable on the
//      app side) until the eventual auto-sync tool replaces hand-mirroring.
// Does NOT: Generate CSS, register Tailwind classes, or read env vars.

export const colors = {
  text: {
    primary: 'oklch(0.18 0.02 250)',
    muted: 'oklch(0.55 0.02 250)',
  },
  surface: {
    base: 'oklch(0.99 0.005 250)',
    raised: 'oklch(0.97 0.01 250)',
  },
  accent: 'oklch(0.65 0.18 250)',
} as const;

export const space = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
} as const;

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  pill: '999px',
} as const;

export type Tokens = {
  colors: typeof colors;
  space: typeof space;
  radius: typeof radius;
};
