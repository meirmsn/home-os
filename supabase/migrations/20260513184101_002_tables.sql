-- Migration 002 — public-schema tables (users, cards, triage_conversations,
-- card_photos, usage_counters) per spec § Data model changes § 002_tables.sql.
--
-- FK conventions:
--   - public.users.id references auth.users(id) on delete cascade (D1).
--   - Every other _id FK uses `on delete cascade` so user-deletion cleanly
--     propagates down the ownership tree.
--
-- CHECK constraints follow D12.

-- public.users — profile row mirrored 1:1 with auth.users.id.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  location text,
  byok_used boolean not null default false
);

-- public.cards — the central card lifecycle row.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  state card_state not null default 'capturing',
  title text,
  initial_description text,
  system_tag system_tag,
  severity severity,
  contractor_tag contractor_tag,
  diagnosis text,
  fix_steps_diy jsonb,
  cost_estimate_diy jsonb,
  fix_steps_hire jsonb,
  cost_estimate_hire jsonb,
  monitoring_cadence_days int,
  next_check_at timestamptz,
  closed_at timestamptz,
  version int not null default 1,
  constraint cards_monitoring_cadence_positive
    check (monitoring_cadence_days is null or monitoring_cadence_days > 0),
  constraint cards_version_positive
    check (version >= 1)
);

create index cards_user_id_idx on public.cards(user_id);
create index cards_state_idx on public.cards(state);

-- public.triage_conversations — append-only conversation rows for triage flow.
create table public.triage_conversations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  round int not null,
  role triage_role not null,
  content text not null,
  constraint triage_round_in_range check (round between 1 and 3)
);

create index triage_conversations_card_id_idx on public.triage_conversations(card_id);
create index triage_conversations_user_id_idx on public.triage_conversations(user_id);

-- public.card_photos — image metadata; storage_path points into card-photos bucket.
create table public.card_photos (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  touchpoint_id uuid not null,
  touchpoint_type touchpoint_type not null,
  slot photo_slot not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index card_photos_card_id_idx on public.card_photos(card_id);
create index card_photos_user_id_idx on public.card_photos(user_id);
create index card_photos_touchpoint_id_idx on public.card_photos(touchpoint_id);

-- public.usage_counters — per-user free-tier usage tally; PK is user_id.
create table public.usage_counters (
  user_id uuid primary key references public.users(id) on delete cascade,
  triage_session_count int not null default 0,
  card_count int not null default 0,
  updated_at timestamptz not null default now(),
  constraint usage_counters_non_negative
    check (triage_session_count >= 0 and card_count >= 0)
);

-- ROLLBACK:
-- drop table if exists public.usage_counters;
-- drop table if exists public.card_photos;
-- drop table if exists public.triage_conversations;
-- drop table if exists public.cards;
-- drop table if exists public.users;
