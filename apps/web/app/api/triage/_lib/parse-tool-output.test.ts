// What: Unit tests for parseInitialRead. Locks the runtime validator
//       contract for every required field + every enum boundary.
// Why:  Validator IS the LLM-response trust boundary (spec § Gotchas #2).
//       A regression that accepted a malformed payload would silently
//       persist garbage into cards.diagnosis / triage_conversations.

import { describe, expect, it } from 'vitest';
import { parseInitialRead, type ParseResult } from './parse-tool-output';

/** Minimal happy-path payload. */
function valid(): Record<string, unknown> {
  return {
    summary: 'A two-sentence read of the issue.',
    severity_provisional: 'soon',
    what_im_confident_about: 'I can see mineral staining.',
    what_i_need_to_know: ['Q1?', 'Q2?', 'Q3?'],
    sources: [{ url: 'https://example.com', title: 'Example' }],
    system_tag_proposed: 'plumbing',
    contractor_tag_proposed: 'plumber',
  };
}

/**
 *
 */
function expectErr(result: ParseResult, field: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.field).toBe(field);
  }
}

describe('parseInitialRead — happy path', () => {
  it('returns ok=true on a valid payload', () => {
    const result = parseInitialRead(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.severity_provisional).toBe('soon');
      expect(result.value.what_i_need_to_know).toHaveLength(3);
    }
  });

  it('tolerates extra fields (forward-compat allowlist)', () => {
    const result = parseInitialRead({
      ...valid(),
      future_field_we_dont_know_about: 'whatever',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts 1 question (minimum)', () => {
    const result = parseInitialRead({
      ...valid(),
      what_i_need_to_know: ['Just one?'],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts 2 questions', () => {
    const result = parseInitialRead({
      ...valid(),
      what_i_need_to_know: ['Q1?', 'Q2?'],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an empty sources array', () => {
    const result = parseInitialRead({ ...valid(), sources: [] });
    expect(result.ok).toBe(true);
  });
});

describe('parseInitialRead — root shape errors', () => {
  it('rejects non-object roots (null)', () => {
    expectErr(parseInitialRead(null), '<root>');
  });

  it('rejects non-object roots (string)', () => {
    expectErr(parseInitialRead('hello'), '<root>');
  });

  it('rejects array roots', () => {
    expectErr(parseInitialRead([]), '<root>');
  });
});

describe('parseInitialRead — missing required fields', () => {
  const fields: (keyof ReturnType<typeof valid>)[] = [
    'summary',
    'severity_provisional',
    'what_im_confident_about',
    'what_i_need_to_know',
    'sources',
    'system_tag_proposed',
    'contractor_tag_proposed',
  ];

  for (const field of fields) {
    it(`returns ParseError naming '${field}' when it's missing`, () => {
      const payload = valid();
      delete payload[field];
      expectErr(parseInitialRead(payload), field);
    });
  }
});

describe('parseInitialRead — enum bounds', () => {
  it('rejects severity_provisional not in the four-tier enum', () => {
    expectErr(
      parseInitialRead({ ...valid(), severity_provisional: 'critical' }),
      'severity_provisional'
    );
  });

  it('rejects system_tag_proposed not in the enum', () => {
    expectErr(
      parseInitialRead({ ...valid(), system_tag_proposed: 'window' }),
      'system_tag_proposed'
    );
  });

  it('rejects contractor_tag_proposed not in the enum', () => {
    expectErr(
      parseInitialRead({ ...valid(), contractor_tag_proposed: 'arborist' }),
      'contractor_tag_proposed'
    );
  });
});

describe('parseInitialRead — what_i_need_to_know length bound', () => {
  it('rejects length 0', () => {
    expectErr(
      parseInitialRead({ ...valid(), what_i_need_to_know: [] }),
      'what_i_need_to_know'
    );
  });

  it('rejects length 4', () => {
    expectErr(
      parseInitialRead({
        ...valid(),
        what_i_need_to_know: ['a', 'b', 'c', 'd'],
      }),
      'what_i_need_to_know'
    );
  });

  it('rejects non-array', () => {
    expectErr(
      parseInitialRead({
        ...valid(),
        what_i_need_to_know: 'just a string',
      }),
      'what_i_need_to_know'
    );
  });

  it('rejects an entry that is not a non-empty string', () => {
    expectErr(
      parseInitialRead({
        ...valid(),
        what_i_need_to_know: ['ok', '', 'ok2'],
      }),
      'what_i_need_to_know[1]'
    );
  });
});

describe('parseInitialRead — sources shape', () => {
  it('rejects sources non-array', () => {
    expectErr(
      parseInitialRead({ ...valid(), sources: { url: 'x', title: 'y' } }),
      'sources'
    );
  });

  it('rejects a source entry missing url', () => {
    expectErr(
      parseInitialRead({
        ...valid(),
        sources: [{ title: 'No URL' }],
      }),
      'sources[0].url'
    );
  });

  it('rejects a source entry missing title', () => {
    expectErr(
      parseInitialRead({
        ...valid(),
        sources: [{ url: 'https://example.com' }],
      }),
      'sources[0].title'
    );
  });

  it('rejects a source entry that is not an object', () => {
    expectErr(
      parseInitialRead({
        ...valid(),
        sources: ['https://example.com'],
      }),
      'sources[0]'
    );
  });

  it('rejects empty-string url', () => {
    expectErr(
      parseInitialRead({
        ...valid(),
        sources: [{ url: '', title: 'Example' }],
      }),
      'sources[0].url'
    );
  });
});
