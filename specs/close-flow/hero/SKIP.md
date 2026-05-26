# Hero capture blocked

- Reason: local Supabase unavailable — card detail pages are auth-gated, middleware redirects to /login without a running Supabase stack
- Fallback: CI slow-job E2E covers the PLANNED→CLOSED flow; Vercel preview is the visual verification surface
- Date: 2026-05-26T10:00:00Z
- SHA: 263db4a
