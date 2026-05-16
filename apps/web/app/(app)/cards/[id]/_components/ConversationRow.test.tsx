// @vitest-environment happy-dom
// What: Unit tests for <ConversationRow />. Locks the (role, tool_name,
//       is_location_ask) dispatcher across all four happy-path
//       variants plus the two fallback paths (unparseable content,
//       unknown tool name).
// Why:  The dispatcher is shared between the compact mid-Q&A thread
//       (<QaThread />) and the confirmed "How we diagnosed this"
//       collapsible (<DiagnosedThread />). A regression in either
//       branch ripples to both surfaces; locking the dispatch matrix
//       here prevents a tool-name drift from leaking via the user-
//       visible thread.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { sentryMessage } = vi.hoisted(() => ({
  sentryMessage: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: sentryMessage,
  captureException: vi.fn(),
}));

import { ConversationRow, type ConversationRowData } from './ConversationRow';

beforeEach(() => {
  sentryMessage.mockReset();
});

afterEach(() => {
  cleanup();
});

/**
 *
 */
function row(overrides: Partial<ConversationRowData>): ConversationRowData {
  return {
    role: 'user',
    round: 2,
    content: 'sample',
    is_location_ask: false,
    tool_name: null,
    ...overrides,
  };
}

describe('<ConversationRow /> — user row', () => {
  it('renders the round number + raw content', () => {
    render(
      <ConversationRow
        row={row({ role: 'user', round: 2, content: 'two weeks' })}
      />
    );
    expect(screen.getByText(/your reply \(round 2\)/i)).toBeTruthy();
    expect(screen.getByText('two weeks')).toBeTruthy();
    expect(screen.queryByTestId('location-tag')).toBeNull();
  });

  it('renders the Location tag when is_location_ask=true', () => {
    render(
      <ConversationRow
        row={row({
          role: 'user',
          round: 2,
          content: '94110',
          is_location_ask: true,
        })}
      />
    );
    expect(screen.getByTestId('location-tag')).toBeTruthy();
  });
});

describe('<ConversationRow /> — assistant rows', () => {
  it('record_initial_read: renders "Initial read" header + summary', () => {
    const content = JSON.stringify({ summary: 'Mineral staining.' });
    render(
      <ConversationRow
        row={row({
          role: 'assistant',
          round: 1,
          content,
          tool_name: 'record_initial_read',
        })}
      />
    );
    expect(screen.getByText(/initial read/i)).toBeTruthy();
    expect(screen.getByText('Mineral staining.')).toBeTruthy();
  });

  it('ask_next_question: renders "Question N" header + question + (when location-ask) the Location tag', () => {
    const content = JSON.stringify({
      question: 'How long has it been there?',
      is_location_ask: false,
    });
    render(
      <ConversationRow
        row={row({
          role: 'assistant',
          round: 3,
          content,
          tool_name: 'ask_next_question',
        })}
      />
    );
    expect(screen.getByText(/question 3/i)).toBeTruthy();
    expect(screen.getByText('How long has it been there?')).toBeTruthy();
    expect(screen.queryByTestId('location-tag')).toBeNull();
  });

  it('ask_next_question + is_location_ask=true: renders the Location tag', () => {
    const content = JSON.stringify({
      question: 'What ZIP are you in?',
    });
    render(
      <ConversationRow
        row={row({
          role: 'assistant',
          round: 3,
          content,
          tool_name: 'ask_next_question',
          is_location_ask: true,
        })}
      />
    );
    expect(screen.getByTestId('location-tag')).toBeTruthy();
  });

  it('confirm_assessment: renders "Confirmed" header + final_diagnosis', () => {
    const content = JSON.stringify({
      final_diagnosis: 'Slow P-trap leak. DIY-friendly.',
    });
    render(
      <ConversationRow
        row={row({
          role: 'assistant',
          round: 4,
          content,
          tool_name: 'confirm_assessment',
        })}
      />
    );
    expect(screen.getByText(/confirmed/i)).toBeTruthy();
    expect(screen.getByText('Slow P-trap leak. DIY-friendly.')).toBeTruthy();
  });
});

describe('<ConversationRow /> — fallback paths', () => {
  it('assistant row with malformed JSON content: renders the fallback copy + drops a Sentry breadcrumb', () => {
    render(
      <ConversationRow
        row={row({
          role: 'assistant',
          round: 2,
          content: '{not json',
          tool_name: 'ask_next_question',
        })}
      />
    );
    expect(screen.getByTestId('conversation-row-fallback')).toBeTruthy();
    expect(screen.getByText(/could not be parsed/i)).toBeTruthy();
    // No throw — render must succeed.
  });

  it('assistant row with unknown tool_name: renders the fallback copy', () => {
    const content = JSON.stringify({ summary: 'x' });
    render(
      <ConversationRow
        row={row({
          role: 'assistant',
          round: 5,
          content,
          tool_name: 'some_future_tool',
        })}
      />
    );
    expect(screen.getByTestId('conversation-row-fallback')).toBeTruthy();
  });

  it('assistant row with null tool_name: renders the fallback copy (no exception)', () => {
    render(
      <ConversationRow
        row={row({
          role: 'assistant',
          round: 1,
          content: '{"summary":"x"}',
          tool_name: null,
        })}
      />
    );
    expect(screen.getByTestId('conversation-row-fallback')).toBeTruthy();
  });
});
