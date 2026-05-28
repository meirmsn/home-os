## Preflight

- TOUCHES_UI=apps/web (yes)
- TOUCHES_MIGRATIONS=
- TOUCHES_FUNCTIONS=
- TOUCHES_KIT=
- TOUCHES_CODE=apps/web (yes)
- TOUCHES_USER_CODE=apps/web (yes)
- HAS_TURBO=yes
- Chromium: yes (148.0.7778.167; playwright chromium-1208)
- Supabase: reused/ok: local Supabase up; .env.local rewritten (backup at .preship-backup)
- Supabase healthy: yes
- Dev server: up on :3000 (307 root → auth redirect)
- local-env-health: HEALTHY (all 4 checks passed)
- Result: pass
