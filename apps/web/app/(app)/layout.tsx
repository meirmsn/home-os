// What: Authenticated-shell layout for the (app) Next route group (D3).
//       Server component that pulls the user via supabase.auth.getUser()
//       on the server (defense-in-depth alongside middleware — see spec §
//       Gotchas), renders a minimal header with the signed-in email + a
//       gear icon link to /settings + a POST sign-out form (D11), wraps
//       children in ByokKeyProvider (D3), and mounts the
//       <SignInCompletedCapture /> child that fires the `sign_in_completed`
//       PostHog event once per session (D7).
// Why:  Middleware (D6) reads cookies only; a tampered/expired cookie can
//       pass that gate but fail layout-side getUser. The redirect here is
//       the second checkpoint that catches that case before the user sees
//       any authenticated UI.
// Does NOT: Persist BYOK key — ByokKeyProvider holds it in React state
//           (memory only, cleared on tab close per spec D3).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ByokKeyProvider } from './_components/ByokKeyProvider';
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
          <Link
            href="/settings"
            aria-label="Settings"
            data-testid="settings-link"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--color-text-secondary-inverse)] hover:text-[var(--color-text-primary-inverse)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </Link>
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
      <ByokKeyProvider>
        <main className="flex flex-1 flex-col px-6 py-8">{children}</main>
      </ByokKeyProvider>
      <SignInCompletedCapture userId={user.id} email={email} />
    </div>
  );
}
