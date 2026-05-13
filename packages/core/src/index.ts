// What: Barrel export for @home-os/core
// Why: Single import surface for app + edge function consumers; keeps the
//      package boundary explicit (no deep-path imports across packages).
// Does NOT: Re-export framework-specific helpers (those live in the app).

export {
  createClient,
  assertNotProdUrlInTestEnv,
  type CoreConfig,
} from './supabase';
export type { Database } from './supabase.types';
