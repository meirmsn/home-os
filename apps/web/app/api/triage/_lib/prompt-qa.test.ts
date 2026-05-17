// What: Unit tests for the Q&A system-prompt resolver. Covers the
//       trim-defense, env-override fallback semantics, the default
//       prompt's required-keyword set, and the Vercel-env-var length
//       bound.
// Why:  Q&A prompt is the second operator-tunable knob (D8) — separate
//       from the initial-read prompt. A regression silently swallowing
//       the override or dropping the persona keywords would be
//       invisible until production triage drift surfaces in PostHog
//       weeks later; lock the contract here.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QA_SYSTEM_PROMPT,
  PROMPT_MAX_CHARS,
  resolveQaSystemPrompt,
} from './prompt-qa';

describe('resolveQaSystemPrompt', () => {
  it('returns the env override (trimmed) when set + non-empty', () => {
    expect(
      resolveQaSystemPrompt({
        env: { TRIAGE_QA_SYSTEM_PROMPT: '  override  ' },
      })
    ).toBe('override');
  });

  it('falls back to the default when env value is empty string', () => {
    expect(
      resolveQaSystemPrompt({ env: { TRIAGE_QA_SYSTEM_PROMPT: '' } })
    ).toBe(DEFAULT_QA_SYSTEM_PROMPT);
  });

  it('falls back to the default when env value is whitespace-only', () => {
    expect(
      resolveQaSystemPrompt({ env: { TRIAGE_QA_SYSTEM_PROMPT: '   \n\t  ' } })
    ).toBe(DEFAULT_QA_SYSTEM_PROMPT);
  });

  it('falls back to the default when env value is undefined', () => {
    expect(resolveQaSystemPrompt({ env: {} })).toBe(DEFAULT_QA_SYSTEM_PROMPT);
  });

  it('does NOT pick up the initial-read prompt env var', () => {
    // TRIAGE_SYSTEM_PROMPT is a different env var (initial-read prompt).
    // The Q&A resolver must not accidentally read it.
    expect(
      resolveQaSystemPrompt({
        env: { TRIAGE_SYSTEM_PROMPT: 'initial-read-override' },
      })
    ).toBe(DEFAULT_QA_SYSTEM_PROMPT);
  });
});

describe('DEFAULT_QA_SYSTEM_PROMPT content', () => {
  it('contains the persona keyword "calm"', () => {
    expect(DEFAULT_QA_SYSTEM_PROMPT.toLowerCase()).toMatch(/calm/);
  });

  it('mentions spiral prevention', () => {
    expect(DEFAULT_QA_SYSTEM_PROMPT.toLowerCase()).toMatch(/spiral/);
  });

  it('mentions "ask one focused question"', () => {
    expect(DEFAULT_QA_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /ask one focused question/
    );
  });

  it('mentions the "3 question budget"', () => {
    expect(DEFAULT_QA_SYSTEM_PROMPT.toLowerCase()).toMatch(/3 question budget/);
  });

  it('mentions location-ask rule', () => {
    expect(DEFAULT_QA_SYSTEM_PROMPT.toLowerCase()).toMatch(/location/);
  });

  it('names both Q&A tools (ask_next_question + confirm_assessment)', () => {
    expect(DEFAULT_QA_SYSTEM_PROMPT).toContain('ask_next_question');
    expect(DEFAULT_QA_SYSTEM_PROMPT).toContain('confirm_assessment');
  });

  it('names each of the four severity tiers', () => {
    for (const tier of ['cosmetic', 'monitor', 'soon', 'urgent']) {
      expect(DEFAULT_QA_SYSTEM_PROMPT).toContain(tier);
    }
  });

  it('stays under the Vercel-env-var length bound', () => {
    expect(DEFAULT_QA_SYSTEM_PROMPT.length).toBeLessThanOrEqual(
      PROMPT_MAX_CHARS
    );
  });
});
