// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({ posthogCapture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: posthogCapture } }));

import { ContractorQuestionsViewOpenedCapture } from './ContractorQuestionsViewOpenedCapture';

beforeEach(() => {
  posthogCapture.mockReset();
  try {
    sessionStorage.clear();
  } catch {
    // no-op
  }
});
afterEach(() => cleanup());

describe('ContractorQuestionsViewOpenedCapture', () => {
  it('fires contractor_questions_view_opened on first mount', () => {
    render(
      <ContractorQuestionsViewOpenedCapture
        groupCount={3}
        totalQuestionCards={7}
      />
    );
    expect(posthogCapture).toHaveBeenCalledWith(
      'contractor_questions_view_opened',
      { group_count: 3, total_question_cards: 7 }
    );
  });

  it('dedups within the same browser session (sessionStorage sentinel)', () => {
    const { unmount } = render(
      <ContractorQuestionsViewOpenedCapture
        groupCount={1}
        totalQuestionCards={1}
      />
    );
    unmount();
    render(
      <ContractorQuestionsViewOpenedCapture
        groupCount={1}
        totalQuestionCards={1}
      />
    );
    // Second mount sees the sentinel and skips firing.
    expect(posthogCapture).toHaveBeenCalledTimes(1);
  });
});
