# @home-os/ui

> Design tokens (TypeScript source of truth) + primitive components. Consumed by `apps/web`.
>
> Source-only package — exports TypeScript via `src/index.ts` with no build step.

## Exports

| Export                          | Purpose                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Design tokens (`src/tokens.ts`) | TypeScript source of truth for colors, text, border, space, radius, typography, motion. Components and route handlers import via JS (`text.primary`); `apps/web/app/globals.css` mirrors the same names as Tailwind v4 `@theme` CSS variables, so JSX can pick either: TypeScript token import OR Tailwind utility class (`text-primary`). |
| `Button` (`src/Button.tsx`)     | Proof-of-concept primitive. Severity chip / status chip / card-face variants ship per-feature via `/ak-build`, not eagerly.                                                                                                                                                                                                                |

## Structure

```
packages/ui/
├── src/
│   ├── index.ts         # barrel — re-exports tokens + components
│   ├── tokens.ts        # color / text / border / space / radius / typography / motion
│   └── Button.tsx       # primitive proof-of-concept
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Design token contract

The token file (`src/tokens.ts`) is the **single source of truth** for color/text/spacing names. `apps/web/app/globals.css` mirrors the same names as Tailwind v4 `@theme` CSS variables — keep them in sync.

Rule of thumb when adding a new token:

1. Add to `src/tokens.ts` with the canonical name.
2. Mirror to `apps/web/app/globals.css` `@theme` block with the matching `--<name>` CSS variable.
3. Use either the TS import (`color.planned`) or the Tailwind utility (`text-planned`) in JSX — both resolve to the same value.

## Primitive lifecycle

`Button.tsx` is the proof-of-concept showing the pattern. Other primitives (severity chips, status chips, card faces) ship **per-feature** via `/ak-build`, NOT eagerly — premature primitives rot before their first consumer arrives.

The `_severity-chip.ts` + `_reminder-chip.ts` lookups in `apps/web/app/(app)/cards/[id]/_components/` are project-side lookups that should move here when a second consumer surfaces; until then, they live with their only call sites.

## Cross-references

- [`../../ARCHITECTURE.md § Components`](../../ARCHITECTURE.md#components) — system context for `@home-os/ui`.
- [`../../apps/web/README.md`](../../apps/web/README.md) — consumer of tokens + primitives.
- [`../../apps/web/app/globals.css`](../../apps/web/app/globals.css) — Tailwind `@theme` mirror of the TS tokens.
- `kit/docs/guide/tailwind.md` (delivered via SessionStart hook) — Tailwind v4 footguns (`@source` directive for workspace-package source scanning; named-key sizing utilities resolving through `--spacing-*`).
