// What: Server component for the /contractor-questions retrieval route.
//       Resolves the authed user (redirect to /login if absent), does an
//       RLS-scoped cards SELECT, runs the pure grouping lib, and renders
//       the view (or its empty state).
// Why:  spec § In scope + API contracts. Read-only presentation over data
//       that already exists — no API route, no client fetch. Mirrors the
//       auth + SELECT + Sentry-on-error posture of home/page.tsx and
//       cards/[id]/page.tsx.
// Does NOT: Write any data, check usage counters, or add offline caching.
//           Does NOT 500 on a PostgREST error — captures to Sentry and
//           falls through to an empty list (degraded-but-calm).

import { redirect } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import {
  groupContractorQuestions,
  type ContractorQuestionCardRow,
} from './_lib/group-contractor-questions';
import { ContractorQuestionsView } from './_components/ContractorQuestionsView';

export const dynamic = 'force-dynamic';

/**
 * Render the cross-card Contractor Questions retrieval view.
 */
export default async function ContractorQuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // RLS scopes this SELECT to the owner — no explicit owner_id filter
  // (defense-in-depth via RLS, mirroring the dashboard).
  const { data: cardRows, error: cardError } = await supabase
    .from('cards')
    .select(
      'id, title, initial_description, state, contractor_tag, chosen_path, cost_estimate_hire, cost_estimate_hire_override, created_at'
    );

  if (cardError) {
    Sentry.captureException(
      new Error('cards SELECT errored on contractor-questions page'),
      {
        tags: { surface: 'contractor-questions', stage: 'cards_select' },
        extra: {
          user_id: user.id,
          error_message: cardError.message,
          error_code: cardError.code,
        },
      }
    );
  }

  const rows = (cardRows ?? []) as ContractorQuestionCardRow[];
  const result = groupContractorQuestions(rows, Date.now());

  return <ContractorQuestionsView result={result} />;
}
