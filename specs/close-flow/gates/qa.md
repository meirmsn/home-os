## Gate 9: qa

**Result**: blocked (n/a per scope: local Supabase unavailable — functional QA deferred to CI slow-job E2E)

**Blocked reason**: The local Supabase stack is not running in this environment. A full functional walk (signup -> create card -> triage -> decide -> plan -> close card -> verify ClosedView) requires Supabase auth + Postgres + storage. This gate's functional coverage is deferred to CI E2E tests that run against a live Supabase instance.

**What would be tested**: signup flow, card creation, triage conversation, decide path selection, PLANNED state with reminders, CloseCardForm submission (outcome + optional before-photo + optional spend), ClosedView rendering with BeforeAfterPhotos and BeforeCloseSummary, restore-from-closed flow.

## Dismissals

None.
