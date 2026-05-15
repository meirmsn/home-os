// What: Unit tests for the triage system-prompt resolver. Covers the
//       trim-defense, the env-override fallback, the default-prompt
//       content keywords (calm authority, spiral prevention, four-tier
//       severity), and the Vercel-env-var length bound.
// Why:  Prompt is the operator-tunable knob (D8). A regression that
//       silently swallowed the override or shipped a default missing
//       the spiral-prevention wording would be invisible until prod —
//       lock the contract here.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRIAGE_SYSTEM_PROMPT,
  PROMPT_MAX_CHARS,
  resolveSystemPrompt,
} from './prompt';

describe('resolveSystemPrompt', () => {
  it('returns the env override (trimmed) when set + non-empty', () => {
    expect(
      resolveSystemPrompt({ env: { TRIAGE_SYSTEM_PROMPT: '  override  ' } })
    ).toBe('override');
  });

  it('falls back to the default when env value is empty string', () => {
    expect(resolveSystemPrompt({ env: { TRIAGE_SYSTEM_PROMPT: '' } })).toBe(
      DEFAULT_TRIAGE_SYSTEM_PROMPT
    );
  });

  it('falls back to the default when env value is whitespace-only', () => {
    expect(
      resolveSystemPrompt({ env: { TRIAGE_SYSTEM_PROMPT: '   \n\t  ' } })
    ).toBe(DEFAULT_TRIAGE_SYSTEM_PROMPT);
  });

  it('falls back to the default when env value is undefined', () => {
    expect(resolveSystemPrompt({ env: {} })).toBe(DEFAULT_TRIAGE_SYSTEM_PROMPT);
  });

  it('falls back to the default when env object omits the key entirely', () => {
    expect(resolveSystemPrompt({ env: { SOMETHING_ELSE: 'x' } })).toBe(
      DEFAULT_TRIAGE_SYSTEM_PROMPT
    );
  });
});

describe('DEFAULT_TRIAGE_SYSTEM_PROMPT content', () => {
  it('contains the persona keywords (calm + spiral)', () => {
    // Case-insensitive — the prompt is human-readable so reviewer-tweaks
    // are expected; the keywords are stable.
    expect(DEFAULT_TRIAGE_SYSTEM_PROMPT.toLowerCase()).toMatch(/calm/);
    expect(DEFAULT_TRIAGE_SYSTEM_PROMPT.toLowerCase()).toMatch(/spiral/);
  });

  it('names each of the four severity tiers', () => {
    for (const tier of ['cosmetic', 'monitor', 'soon', 'urgent']) {
      expect(DEFAULT_TRIAGE_SYSTEM_PROMPT).toContain(tier);
    }
  });

  it('names the record_initial_read tool exclusively', () => {
    expect(DEFAULT_TRIAGE_SYSTEM_PROMPT).toContain('record_initial_read');
  });

  it('mentions web_search as the citation source', () => {
    expect(DEFAULT_TRIAGE_SYSTEM_PROMPT).toContain('web_search');
  });

  it('stays under the Vercel-env-var length bound', () => {
    // Defense against future expansion accidentally blowing past 4 KB.
    // Spec § Gotchas #3 — leave headroom; we target ≤ 3500 chars.
    expect(DEFAULT_TRIAGE_SYSTEM_PROMPT.length).toBeLessThanOrEqual(
      PROMPT_MAX_CHARS
    );
  });
});
