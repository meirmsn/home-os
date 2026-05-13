// What: Typed design tokens for @home-os/ui.
// Why: TypeScript source of truth for runtime token references
//      (e.g. `style={{ color: text.primary }}`). Tailwind v4 reads its own
//      tokens from CSS `@theme` in apps/web/app/globals.css — keep the two
//      in sync at the naming level (a token added here gets a matching CSS
//      variable on the app side).
// Source: .gstack/design-review-home-os-2026-05-02.md is the design
//      authority. Component primitives (severity chip, status chip, card
//      face variants, etc.) ship per-feature via /ak-build; the review
//      explicitly lists those as a separate workflow.

/* ----------------------------------------------------------------- color */

export const colors = {
  /** App background — dark warm charcoal, never pure black. */
  background: {
    base: '#1C1B18',
    raised: '#242320',
    overlay: 'rgba(28,27,24,0.85)',
  },
  /** Neutral palette — card surfaces lift off the dark ground. */
  neutral: {
    50: '#F7F7F5', // Tier 1 card surface
    100: '#EEECEA', // Tier 2 card surface
    150: '#E2E0DC', // PLANNED card surface
    200: '#C8C6C0', // borders, dividers, progress-bar track
    500: '#8A8880', // secondary text, metadata
    800: '#2C2B27', // primary text on card surfaces
  },
  /** Severity — urgency without alarm. */
  severity: {
    actSoon: '#C4622D', // warm terracotta
    watch: '#A07C2E', // warm amber
    note: '#4A7B6F', // muted teal-green
  },
  /** Resolved / active state colors. */
  state: {
    planned: '#5C6BC0', // calm indigo — handled, decided
    monitor: '#7B6BA8', // muted purple — active but not urgent
  },
} as const;

/** Semantic text tokens layered on top of the raw palette. */
export const text = {
  primary: colors.neutral[800], // on card surfaces
  primaryInverse: '#F0EFEB', // on dark background
  secondary: colors.neutral[500], // on card surfaces
  secondaryInverse: '#6B6A63', // on dark background
} as const;

/** Border tokens. */
export const border = {
  default: colors.neutral[200],
  subtle: 'rgba(255,255,255,0.06)', // dividers on dark ground
} as const;

/* ---------------------------------------------------------------- space */

/** 8px base unit. `space[7]` is intentionally absent — design review uses
 *  1/2/3/4/5/6/8 only. */
export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '24px',
  6: '32px',
  8: '64px',
} as const;

/* --------------------------------------------------------------- radius */

/** Tier 1 cards have no radius; Tier 2 / PLANNED cap at 4px. */
export const radius = {
  none: '0',
  sm: '4px',
} as const;

/* ----------------------------------------------------------- typography */

/** Inter — variable font, Latin+numeric subset preloaded in app layout. */
export const typography = {
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  size: {
    xs: '12px', // chip labels, timestamps, secondary metadata
    sm: '14px', // card secondary text, filter labels
    base: '16px', // body text, description input
    lg: '20px', // Tier 1 card issue name
    xl: '24px', // detail primary summary, Settings usage value
    display: '32px', // empty-state headline only
  },
  lineHeight: {
    body: 1.5, // 16px body
    display: 1.3, // 20px+
    chip: 1, // 12px single-line chips
  },
  letterSpacing: {
    chip: '0.04em',
    body: '0',
    display: '-0.01em',
  },
} as const;

/* --------------------------------------------------------------- motion */

/** 5-animation budget. Each entry names its job. Reduced motion = instant. */
export const motion = {
  /** Card slide to PLANNED — confirms resolution. */
  cardToPlanned: { duration: '300ms', easing: 'cubic-bezier(0,0,0.2,1)' },
  /** "Tell me more" reveal — signals more exists. */
  revealMore: { duration: '200ms', easing: 'ease-in-out' },
  /** DISMISS card exit — confirms deliberate action. */
  dismissExit: {
    durationOpacity: '150ms',
    durationCollapse: '100ms',
    easing: 'cubic-bezier(0.4,0,1,1)',
  },
  /** Severity chip transition — confirms triage complete. */
  chipTransition: { duration: '200ms', easing: 'linear' },
  /** Bounce mode cadences (product decision, not micro-interaction). */
  bounce: { slow: '1200ms', default: '750ms', fast: '400ms' },
} as const;

/* -------------------------------------------------------------- exports */

export type Colors = typeof colors;
export type Text = typeof text;
export type Border = typeof border;
export type Space = typeof space;
export type Radius = typeof radius;
export type Typography = typeof typography;
export type Motion = typeof motion;

export type Tokens = {
  colors: Colors;
  text: Text;
  border: Border;
  space: Space;
  radius: Radius;
  typography: Typography;
  motion: Motion;
};
