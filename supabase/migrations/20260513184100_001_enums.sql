-- Migration 001 — enum types for the home-os schema.
-- Source: specs/supabase-schema-and-rls/spec.md § Data model changes § 001_enums.sql.
-- Decision D4: native Postgres enums (not text + CHECK) so Database['public']['Enums']
-- gets string-literal types in the generated supabase.types.ts.

create type card_state as enum (
  'capturing',
  'triaging',
  'diagnosed',
  'monitoring',
  'closed'
);

create type system_tag as enum (
  'plumbing',
  'electrical',
  'hvac',
  'roof',
  'exterior',
  'interior',
  'appliance',
  'safety',
  'other'
);

create type severity as enum (
  'cosmetic',
  'monitor',
  'soon',
  'urgent'
);

create type contractor_tag as enum (
  'diy',
  'handyman',
  'plumber',
  'electrician',
  'hvac_tech',
  'roofer',
  'general_contractor',
  'specialist'
);

create type touchpoint_type as enum (
  'primary',
  'context',
  'closeup'
);

create type photo_slot as enum (
  'wide',
  'medium',
  'closeup'
);

create type triage_role as enum (
  'system',
  'user',
  'assistant'
);

-- ROLLBACK:
-- drop type if exists triage_role;
-- drop type if exists photo_slot;
-- drop type if exists touchpoint_type;
-- drop type if exists contractor_tag;
-- drop type if exists severity;
-- drop type if exists system_tag;
-- drop type if exists card_state;
