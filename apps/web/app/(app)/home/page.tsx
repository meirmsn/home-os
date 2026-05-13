// What: Minimal authenticated landing for /(app)/home. Renders the page
//       heading + a "Signed in as <email>" paragraph (D3, D5). Re-reads
//       `getUser` instead of pulling from layout props — Next App Router
//       doesn't pass parent-layout state to child pages, and the second
//       Supabase call is cached within the request via @supabase/ssr.
// Why:  Proves the round-trip works (D5). Real Home ships in a later PR;
//       this is the smallest possible authenticated surface that exercises
//       the cookie + RSC pipeline.
// Does NOT: Add any card / chip / interactive primitive (spec § Screens
//           /(app)/home). Sign-out lives in the parent layout's header.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 *
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Defense-in-depth — middleware should have caught this. If we land
    // here without a user, bounce to /login rather than crashing on
    // `user.email` below.
    redirect('/login');
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
        home-os
      </h1>
      <p className="text-sm text-[var(--color-text-secondary-inverse)]">
        Signed in as <strong>{user.email}</strong>. More coming soon.
      </p>
    </section>
  );
}
