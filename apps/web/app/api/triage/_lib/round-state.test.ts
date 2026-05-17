// What: Table-driven unit tests for computeQaRoundState. Locks the
//       round-counting + location-ask-detection contract that the
//       /api/triage/answer route reads to decide whether to force
//       `confirm_assessment` (D4 + D9) and whether to dual-write the
//       user's answer into users.location (D6).
// Why:  This helper is the single seam between thread-history shape and
//       route-handler dispatch. A regression here would silently break
//       the 3-round cap OR silently never trigger the location dual-
//       write — both are observable-only in production telemetry.

import { describe, expect, it } from 'vitest';
import { computeQaRoundState, type ThreadRow } from './round-state';

/**
 *
 */
function row(
  partial: Partial<ThreadRow> & { round: number; role: 'user' | 'assistant' }
): ThreadRow {
  return {
    created_at: '2026-05-16T00:00:00.000Z',
    is_location_ask: false,
    tool_name: null,
    ...partial,
  };
}

describe('computeQaRoundState', () => {
  it('empty thread → defensive defaults (qaUserCount=0, nextRound=1)', () => {
    expect(computeQaRoundState([])).toEqual({
      qaUserCount: 0,
      nextRound: 1,
      priorWasLocationAsk: false,
      priorAssistantToolName: null,
    });
  });

  it('initial-read-only thread → qaUserCount=0, nextRound=2', () => {
    const rows: ThreadRow[] = [
      row({
        round: 1,
        role: 'assistant',
        tool_name: 'record_initial_read',
        created_at: '2026-05-16T00:00:00.000Z',
      }),
    ];
    expect(computeQaRoundState(rows)).toEqual({
      qaUserCount: 0,
      nextRound: 2,
      priorWasLocationAsk: false,
      priorAssistantToolName: 'record_initial_read',
    });
  });

  it('initial + 1 Q&A pair (non-location) → qaUserCount=1, nextRound=3', () => {
    const rows: ThreadRow[] = [
      row({
        round: 1,
        role: 'assistant',
        tool_name: 'record_initial_read',
        created_at: '2026-05-16T00:00:00.000Z',
      }),
      row({
        round: 2,
        role: 'user',
        created_at: '2026-05-16T00:01:00.000Z',
      }),
      row({
        round: 2,
        role: 'assistant',
        tool_name: 'ask_next_question',
        created_at: '2026-05-16T00:01:01.000Z',
      }),
    ];
    expect(computeQaRoundState(rows)).toEqual({
      qaUserCount: 1,
      nextRound: 3,
      priorWasLocationAsk: false,
      priorAssistantToolName: 'ask_next_question',
    });
  });

  it('initial + 1 location-ask Q&A pair → qaUserCount=0 (location free), nextRound=3, priorWasLocationAsk=true', () => {
    const rows: ThreadRow[] = [
      row({
        round: 1,
        role: 'assistant',
        tool_name: 'record_initial_read',
        created_at: '2026-05-16T00:00:00.000Z',
      }),
      row({
        round: 2,
        role: 'user',
        is_location_ask: true,
        created_at: '2026-05-16T00:01:00.000Z',
      }),
      row({
        round: 2,
        role: 'assistant',
        tool_name: 'ask_next_question',
        is_location_ask: true,
        created_at: '2026-05-16T00:01:01.000Z',
      }),
    ];
    expect(computeQaRoundState(rows)).toEqual({
      qaUserCount: 0,
      nextRound: 3,
      priorWasLocationAsk: true,
      priorAssistantToolName: 'ask_next_question',
    });
  });

  it('initial + 3 non-location Q&A pairs → qaUserCount=3, nextRound=5 (route forces confirm)', () => {
    const rows: ThreadRow[] = [
      row({
        round: 1,
        role: 'assistant',
        tool_name: 'record_initial_read',
        created_at: '2026-05-16T00:00:00.000Z',
      }),
      row({ round: 2, role: 'user', created_at: '2026-05-16T00:01:00.000Z' }),
      row({
        round: 2,
        role: 'assistant',
        tool_name: 'ask_next_question',
        created_at: '2026-05-16T00:01:01.000Z',
      }),
      row({ round: 3, role: 'user', created_at: '2026-05-16T00:02:00.000Z' }),
      row({
        round: 3,
        role: 'assistant',
        tool_name: 'ask_next_question',
        created_at: '2026-05-16T00:02:01.000Z',
      }),
      row({ round: 4, role: 'user', created_at: '2026-05-16T00:03:00.000Z' }),
      row({
        round: 4,
        role: 'assistant',
        tool_name: 'ask_next_question',
        created_at: '2026-05-16T00:03:01.000Z',
      }),
    ];
    const state = computeQaRoundState(rows);
    expect(state.qaUserCount).toBe(3);
    expect(state.nextRound).toBe(5);
    expect(state.priorWasLocationAsk).toBe(false);
    expect(state.priorAssistantToolName).toBe('ask_next_question');
  });

  it('mixed location + non-location Q&A rounds: location rows excluded from count', () => {
    const rows: ThreadRow[] = [
      row({
        round: 1,
        role: 'assistant',
        tool_name: 'record_initial_read',
        created_at: '2026-05-16T00:00:00.000Z',
      }),
      row({
        round: 2,
        role: 'user',
        is_location_ask: true,
        created_at: '2026-05-16T00:01:00.000Z',
      }),
      row({
        round: 2,
        role: 'assistant',
        tool_name: 'ask_next_question',
        is_location_ask: true,
        created_at: '2026-05-16T00:01:01.000Z',
      }),
      row({ round: 3, role: 'user', created_at: '2026-05-16T00:02:00.000Z' }),
      row({
        round: 3,
        role: 'assistant',
        tool_name: 'ask_next_question',
        created_at: '2026-05-16T00:02:01.000Z',
      }),
    ];
    const state = computeQaRoundState(rows);
    expect(state.qaUserCount).toBe(1);
    expect(state.priorWasLocationAsk).toBe(false);
    expect(state.priorAssistantToolName).toBe('ask_next_question');
  });

  it('tolerates out-of-order timestamps (sorts internally)', () => {
    // Insert the rows in reverse chronological order; expect the same result
    // as the in-order case.
    const rows: ThreadRow[] = [
      row({
        round: 2,
        role: 'assistant',
        tool_name: 'ask_next_question',
        created_at: '2026-05-16T00:01:01.000Z',
      }),
      row({ round: 2, role: 'user', created_at: '2026-05-16T00:01:00.000Z' }),
      row({
        round: 1,
        role: 'assistant',
        tool_name: 'record_initial_read',
        created_at: '2026-05-16T00:00:00.000Z',
      }),
    ];
    const state = computeQaRoundState(rows);
    expect(state.qaUserCount).toBe(1);
    expect(state.nextRound).toBe(3);
    expect(state.priorAssistantToolName).toBe('ask_next_question');
  });

  it('still returns priorAssistantToolName=null when no assistant row present (defensive)', () => {
    const rows: ThreadRow[] = [
      row({ round: 2, role: 'user', created_at: '2026-05-16T00:01:00.000Z' }),
    ];
    const state = computeQaRoundState(rows);
    expect(state.priorAssistantToolName).toBeNull();
    expect(state.priorWasLocationAsk).toBe(false);
  });
});
