// What: Unit tests for parseQaTurn — the LLM-response trust boundary
//       validator. Covers both happy paths (ask_next_question +
//       confirm_assessment), every required-field violation, every
//       enum violation, structural cases (no tool_use block, unknown
//       tool name), and forward-compat (extra fields tolerated).
// Why:  spec § Gotchas #2 — the model can refuse, return text-only,
//       or return malformed input even with both tools forced
//       available. Spec § Gotchas #3 — force-confirm can still produce
//       a defiant ask_next_question. This validator is the only thing
//       between Claude's output and the database; locking every branch
//       prevents a malformed payload from poisoning triage_conversations.

import { describe, expect, it } from 'vitest';
import { parseQaTurn } from './parse-qa-output';

const VALID_ASK = {
  question: 'How long has the leak been visible?',
  is_location_ask: false,
  updated_provisional_severity: 'monitor',
  reasoning_so_far: 'Mineral staining suggests a slow drip over weeks.',
};

const VALID_CONFIRM = {
  final_diagnosis: 'Slow water leak from the P-trap. Manageable with a wrench.',
  severity_confirmed: 'soon',
  system_tag: 'plumbing',
  contractor_tag: 'diy',
  monitoring_cadence_days_proposal: 14,
  confidence_note: 'High confidence based on the photo.',
  sources: [
    { url: 'https://example.com/p-trap', title: 'P-trap repair guide' },
  ],
};

/**
 *
 */
function askResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', name: 'ask_next_question', input }],
  };
}

/**
 *
 */
function confirmResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', name: 'confirm_assessment', input }],
  };
}

describe('parseQaTurn — structural', () => {
  it('returns ParseError when content is missing', () => {
    const result = parseQaTurn({});
    expect(result.ok).toBe(false);
  });

  it('returns ParseError when content is not an array', () => {
    const result = parseQaTurn({ content: 'oops' as unknown });
    expect(result.ok).toBe(false);
  });

  it('returns ParseError when no tool_use block is present (text-only)', () => {
    const result = parseQaTurn({
      content: [{ type: 'text', text: 'I cannot answer.' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('content');
    }
  });

  it('returns ParseError when tool name is neither known tool', () => {
    const result = parseQaTurn({
      content: [{ type: 'tool_use', name: 'some_other_tool', input: {} }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('tool_use.name');
    }
  });

  it('picks the FIRST tool_use block when multiple are present', () => {
    const result = parseQaTurn({
      content: [
        { type: 'tool_use', name: 'ask_next_question', input: VALID_ASK },
        {
          type: 'tool_use',
          name: 'confirm_assessment',
          input: VALID_CONFIRM,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tool).toBe('ask_next_question');
  });
});

describe('parseQaTurn — ask_next_question happy path', () => {
  it('returns ok with the parsed value for a valid payload', () => {
    const result = parseQaTurn(askResponse(VALID_ASK));
    expect(result.ok).toBe(true);
    if (result.ok && result.tool === 'ask_next_question') {
      expect(result.value).toEqual(VALID_ASK);
    }
  });

  it('tolerates extra fields (forward-compat)', () => {
    const result = parseQaTurn(
      askResponse({ ...VALID_ASK, future_field: 'ignored' })
    );
    expect(result.ok).toBe(true);
  });

  it('accepts is_location_ask=true', () => {
    const result = parseQaTurn(
      askResponse({ ...VALID_ASK, is_location_ask: true })
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.tool === 'ask_next_question') {
      expect(result.value.is_location_ask).toBe(true);
    }
  });

  it('accepts an empty reasoning_so_far (just a string, not required to be non-empty)', () => {
    const result = parseQaTurn(
      askResponse({ ...VALID_ASK, reasoning_so_far: '' })
    );
    expect(result.ok).toBe(true);
  });
});

describe('parseQaTurn — ask_next_question violations', () => {
  it('missing question → ParseError', () => {
    const rest = { ...VALID_ASK } as Partial<typeof VALID_ASK>;
    delete rest.question;
    const result = parseQaTurn(askResponse(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('question');
  });

  it('empty question string → ParseError', () => {
    const result = parseQaTurn(askResponse({ ...VALID_ASK, question: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('question');
  });

  it('is_location_ask not boolean → ParseError', () => {
    const result = parseQaTurn(
      askResponse({ ...VALID_ASK, is_location_ask: 'no' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('is_location_ask');
  });

  it('updated_provisional_severity out of enum → ParseError', () => {
    const result = parseQaTurn(
      askResponse({ ...VALID_ASK, updated_provisional_severity: 'critical' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('updated_provisional_severity');
  });

  it('reasoning_so_far not a string → ParseError', () => {
    const result = parseQaTurn(
      askResponse({ ...VALID_ASK, reasoning_so_far: 42 })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('reasoning_so_far');
  });

  it('input is not an object → ParseError', () => {
    const result = parseQaTurn({
      content: [{ type: 'tool_use', name: 'ask_next_question', input: 'wat' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('<root>');
  });
});

describe('parseQaTurn — confirm_assessment happy path', () => {
  it('returns ok with the parsed value for a valid payload', () => {
    const result = parseQaTurn(confirmResponse(VALID_CONFIRM));
    expect(result.ok).toBe(true);
    if (result.ok && result.tool === 'confirm_assessment') {
      expect(result.value).toEqual(VALID_CONFIRM);
    }
  });

  it('accepts an empty sources array', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, sources: [] })
    );
    expect(result.ok).toBe(true);
  });

  it('tolerates extra fields', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, future_field: 'ignored' })
    );
    expect(result.ok).toBe(true);
  });

  it('accepts up to 5 sources', () => {
    const sources = Array.from({ length: 5 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: `Source ${i}`,
    }));
    const result = parseQaTurn(confirmResponse({ ...VALID_CONFIRM, sources }));
    expect(result.ok).toBe(true);
  });
});

describe('parseQaTurn — confirm_assessment violations', () => {
  it('missing final_diagnosis → ParseError', () => {
    const rest = { ...VALID_CONFIRM } as Partial<typeof VALID_CONFIRM>;
    delete rest.final_diagnosis;
    const result = parseQaTurn(confirmResponse(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('final_diagnosis');
  });

  it('empty final_diagnosis → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, final_diagnosis: '' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('final_diagnosis');
  });

  it('severity_confirmed out of enum → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, severity_confirmed: 'critical' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('severity_confirmed');
  });

  it('system_tag out of enum → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, system_tag: 'aliens' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('system_tag');
  });

  it('contractor_tag out of enum → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, contractor_tag: 'wizard' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('contractor_tag');
  });

  it('monitoring_cadence_days_proposal not a number → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({
        ...VALID_CONFIRM,
        monitoring_cadence_days_proposal: '14',
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.field).toBe('monitoring_cadence_days_proposal');
  });

  it('monitoring_cadence_days_proposal not integer → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({
        ...VALID_CONFIRM,
        monitoring_cadence_days_proposal: 14.5,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.field).toBe('monitoring_cadence_days_proposal');
  });

  it('monitoring_cadence_days_proposal ≤ 0 → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, monitoring_cadence_days_proposal: 0 })
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.field).toBe('monitoring_cadence_days_proposal');
  });

  it('confidence_note not a string → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, confidence_note: null })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('confidence_note');
  });

  it('sources not an array → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({ ...VALID_CONFIRM, sources: 'oops' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('sources');
  });

  it('sources length > 5 → ParseError', () => {
    const sources = Array.from({ length: 6 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: `Source ${i}`,
    }));
    const result = parseQaTurn(confirmResponse({ ...VALID_CONFIRM, sources }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('sources');
  });

  it('source missing url → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({
        ...VALID_CONFIRM,
        sources: [{ title: 'Only a title' }],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('sources[0].url');
  });

  it('source missing title → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({
        ...VALID_CONFIRM,
        sources: [{ url: 'https://example.com/x' }],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('sources[0].title');
  });

  it('source not an object → ParseError', () => {
    const result = parseQaTurn(
      confirmResponse({
        ...VALID_CONFIRM,
        sources: ['just a string'],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('sources[0]');
  });

  it('input is not an object → ParseError', () => {
    const result = parseQaTurn({
      content: [{ type: 'tool_use', name: 'confirm_assessment', input: 'wat' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('<root>');
  });
});
