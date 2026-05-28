## Gate 2: metrics-check

- Result: pass

METRICS.md row for `photo_comparison_opened` present (METRICS.md:59) with
properties `{ card_state, touchpoint_count }` and a Sentry/observability
rationale. The event is fired once-per-(card × session) from
`PhotoComparisonOpenedCapture.tsx` (sessionStorage sentinel
`home_os.photo_comparison_opened_fired:<card_id>`), mounted by `<PhotoComparison />`
on the compare route. Capture component + unit test shipped in 9300e29.

## Dismissals

None
