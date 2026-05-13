// What: Authenticated-shell layout for the (app) Next route group (D3).
//       Server component that pulls the user via supabase.auth.getUser()
//       on the server (defense-in-depth alongside middleware — see spec §
//       Gotchas), renders a minimal header with the signed-in email + a
//       POST sign-out form (D11), and mounts the <SignInCompletedCapture />
//       child that fires the `sign_in_completed` PostHog event once per
//       session (D7).
// Why:  Middleware (D6) reads cookies only; a tampered/expired cookie can
//       pass that gate but fail layout-side getUser. The redirect here is
//       the second checkpoint that catches that case before the user sees
//       any authenticated UI.
// Does NOT: Style elaborately — sign-out is a bare <form><button> per D11.
//           Visual polish ships with the Settings/Profile feature later
//           (PRODUCT-ROADMAP.md).

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignInCompletedCapture } from './_components/SignInCompletedCapture';

export const dynamic = 'force-dynamic';

/**
 *
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const email = user.email ?? '';

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-4">
        <div className="text-sm font-semibold text-[var(--color-text-primary-inverse)]">
          home-os
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-sm text-[var(--color-text-secondary-inverse)]"
            data-testid="signed-in-email"
          >
            {email}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-surface-raised)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-6 py-8">{children}</main>
      <SignInCompletedCapture userId={user.id} email={email} />
    </div>
  );
}
