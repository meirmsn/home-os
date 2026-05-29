// What: Client view for the Contractor Questions retrieval route. Renders
//       the contractor-type groups (header + copy-friendly question list),
//       the per-group appointment nudge (when showNudge), the once-per-
//       session view-opened capture, and a calm empty state when there are
//       no groups.
// Why:  spec § Screens + Render conditions. Presentation only — the
//       filtering/grouping/nudge math is done in the grouping lib; this
//       component just maps the result to the dark warm-charcoal UI and
//       owns the two PostHog side effects via child capture components.
// Does NOT: Fetch data, decide the nudge threshold, or group cards. Does
//           NOT mutate any card (editing lives on cards/[id]).

import type { GroupContractorQuestionsResult } from '../_lib/group-contractor-questions';
import { contractorTagLabel } from '../_lib/contractor-tag-label';
import { ContractorAppointmentNudge } from './ContractorAppointmentNudge';
import { ContractorQuestionsViewOpenedCapture } from './ContractorQuestionsViewOpenedCapture';

export type ContractorQuestionsViewProps = {
  result: GroupContractorQuestionsResult;
};

/**
 * Render the grouped contractor questions, or a calm empty state.
 */
export function ContractorQuestionsView({
  result,
}: ContractorQuestionsViewProps) {
  const { groups, totalQuestionCards } = result;

  return (
    <section
      data-testid="contractor-questions-view"
      className="mx-auto w-full max-w-[720px] px-4 py-6"
    >
      <ContractorQuestionsViewOpenedCapture
        groupCount={groups.length}
        totalQuestionCards={totalQuestionCards}
      />

      <h1 className="mb-1 text-lg font-semibold text-[var(--color-text-primary-inverse)]">
        Contractor questions
      </h1>
      <p className="mb-6 text-sm text-[var(--color-text-secondary-inverse)]">
        Questions your triage suggested, grouped by the kind of pro you&apos;d
        call — a ready checklist for any service visit.
      </p>

      {groups.length === 0 ? (
        <div
          data-testid="contractor-questions-empty"
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <p className="text-sm text-[var(--color-text-secondary-inverse)]">
            No contractor questions yet. When triage suggests calling a pro and
            has questions worth asking, they&apos;ll gather here by trade.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => {
            const label = contractorTagLabel(group.contractorType);
            return (
              <div
                key={group.contractorType}
                data-testid={`contractor-group-${group.contractorType}`}
                className="space-y-3"
              >
                <div className="flex items-baseline justify-between">
                  <h2 className="text-base font-semibold text-[var(--color-text-primary-inverse)]">
                    {label}
                  </h2>
                  <span className="text-xs text-[var(--color-text-secondary-inverse)]">
                    {group.questionCount} question
                    {group.questionCount === 1 ? '' : 's'} ·{' '}
                    {group.cards.length} card
                    {group.cards.length === 1 ? '' : 's'}
                  </span>
                </div>

                {group.showNudge && (
                  <ContractorAppointmentNudge
                    contractorType={group.contractorType}
                    questionCount={group.questionCount}
                    oldestCardDays={group.oldestCardDays}
                  />
                )}

                <div className="space-y-4">
                  {group.cards.map((card) => (
                    <div
                      key={card.cardId}
                      data-testid={`contractor-card-${card.cardId}`}
                      className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-raised)] p-4"
                    >
                      <h3 className="mb-2 text-sm font-medium text-[var(--color-text-primary-inverse)]">
                        {card.title}
                      </h3>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-text-secondary-inverse)]">
                        {card.questions.map((q, i) => (
                          <li key={i} data-testid="contractor-question">
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
