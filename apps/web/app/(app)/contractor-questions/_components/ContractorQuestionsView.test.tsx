// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({ posthogCapture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: posthogCapture } }));

import { ContractorQuestionsView } from './ContractorQuestionsView';
import type { GroupContractorQuestionsResult } from '../_lib/group-contractor-questions';

beforeEach(() => {
  posthogCapture.mockReset();
  // sessionStorage persists across tests in the same happy-dom file; the
  // view-opened capture dedups on a sentinel, so clear it between tests.
  try {
    sessionStorage.clear();
  } catch {
    // no-op if storage is unavailable
  }
});
afterEach(() => cleanup());

const RESULT: GroupContractorQuestionsResult = {
  totalQuestionCards: 2,
  groups: [
    {
      contractorType: 'electrician',
      questionCount: 2,
      oldestCardDays: 5,
      showNudge: false,
      cards: [
        {
          cardId: 'e1',
          title: 'Flickering kitchen light',
          questions: ['Is the wiring up to code?', 'Do I need a new breaker?'],
          createdAt: '2026-05-26T00:00:00.000Z',
        },
      ],
    },
    {
      contractorType: 'plumber',
      questionCount: 1,
      oldestCardDays: 40,
      showNudge: true,
      cards: [
        {
          cardId: 'p1',
          title: 'Slow leak under sink',
          questions: ['Will you open the wall?'],
          createdAt: '2026-04-22T00:00:00.000Z',
        },
      ],
    },
  ],
};

describe('ContractorQuestionsView', () => {
  it('renders groups, cards, and question items', () => {
    render(<ContractorQuestionsView result={RESULT} />);
    expect(screen.getByTestId('contractor-group-electrician')).toBeTruthy();
    expect(screen.getByTestId('contractor-group-plumber')).toBeTruthy();
    expect(screen.getByText('Flickering kitchen light')).toBeTruthy();
    expect(screen.getAllByTestId('contractor-question')).toHaveLength(3);
  });

  it('renders the nudge banner only for groups with showNudge', () => {
    render(<ContractorQuestionsView result={RESULT} />);
    const nudges = screen.getAllByTestId('contractor-appointment-nudge');
    expect(nudges).toHaveLength(1);
    // The nudge belongs to the plumber group (showNudge: true).
    const plumber = screen.getByTestId('contractor-group-plumber');
    expect(
      within(plumber).getByTestId('contractor-appointment-nudge')
    ).toBeTruthy();
    expect(nudges[0]!.textContent).toContain(
      'You have 1 open question for your Plumber contractor.'
    );
  });

  it('fires the view-opened event once on mount', () => {
    render(<ContractorQuestionsView result={RESULT} />);
    expect(posthogCapture).toHaveBeenCalledWith(
      'contractor_questions_view_opened',
      { group_count: 2, total_question_cards: 2 }
    );
  });

  it('fires the nudge-shown event for the rendered nudge', () => {
    render(<ContractorQuestionsView result={RESULT} />);
    expect(posthogCapture).toHaveBeenCalledWith(
      'contractor_appointment_nudge_shown',
      { contractor_type: 'plumber', question_count: 1, oldest_card_days: 40 }
    );
  });

  it('renders the empty state when there are no groups', () => {
    render(
      <ContractorQuestionsView result={{ groups: [], totalQuestionCards: 0 }} />
    );
    expect(screen.getByTestId('contractor-questions-empty')).toBeTruthy();
    expect(screen.queryByTestId('contractor-group-plumber')).toBeNull();
  });
});
