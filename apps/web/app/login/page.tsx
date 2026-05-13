// What: `/login` server-component shell. Renders the small client-side
//       <LoginForm /> child that talks to Supabase OTP (D5, D12). Reads the
//       `?error=callback_failed` query (set by /auth/callback on a failed
//       PKCE exchange) and surfaces it to the form so the user sees an
//       expired/used-link banner above the email input.
// Why:  Keep the page itself a server component (no client JS shipped for
//       the static shell); colocate the interactive form in a `_components`
//       client child so the boundary is explicit.
// Does NOT: Call Supabase directly — `signInWithOtp` is invoked from the
//           client-side LoginForm where `window.location.origin` is
//           available for `emailRedirectTo` (D13).

import { LoginForm } from './_components/LoginForm';

// Route handlers + pages that read cookies / search params at request time
// must be dynamic — Next 16 will static-render anything that doesn't touch
// request-scoped state.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string | string[] }>;

/** Server-side `/login` page. Forwards the `?error` value to the form. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorCode = typeof rawError === 'string' ? rawError : undefined;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
            Sign in to home-os
          </h1>
          <p className="text-sm text-[var(--color-text-secondary-inverse)]">
            Enter your email — we&apos;ll send you a sign-in link.
          </p>
        </header>
        <LoginForm initialErrorCode={errorCode} />
      </div>
    </main>
  );
}
