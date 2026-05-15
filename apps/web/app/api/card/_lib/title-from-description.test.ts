// What: Table-driven unit tests for titleFromDescription. Covers empty,
//       under-cap, at-cap, just-over-cap (truncates at last whitespace +
//       suffix), one-long-word over cap (hard cut + suffix), trailing
//       whitespace, and unicode (UTF-16 code-unit counting — documented).
// Why:  Single helper, all card titles flow through it; lock the boundary
//       behaviour in tests so a future "smart" rewrite can't regress.

import { describe, expect, it } from 'vitest';
import { titleFromDescription } from './title-from-description';

describe('titleFromDescription', () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    { name: 'empty', input: '', expected: '' },
    { name: 'whitespace-only', input: '   \n\t  ', expected: '' },
    { name: '1-char', input: 'x', expected: 'x' },
    {
      name: 'exactly 80 chars (no ellipsis)',
      input: 'a'.repeat(80),
      expected: 'a'.repeat(80),
    },
    {
      name: 'just over 80 chars with trailing space inside window — backs off to last space',
      input: 'word '.repeat(20).trim(), // 99 chars: "word word ... word" (20 words)
      // First 80 chars = 16 full "word " tokens (5 chars * 16 = 80 incl. trailing space).
      // lastSpace = 79, so head = 16 words space-separated.
      expected: `${Array(16).fill('word').join(' ')}…`,
    },
    {
      name: 'one long word > 80 chars (no whitespace) — hard cut + suffix',
      input: 'a'.repeat(120),
      expected: `${'a'.repeat(80)}…`,
    },
    {
      name: 'trims leading + trailing whitespace before windowing',
      input: '   hello world   ',
      expected: 'hello world',
    },
    {
      name: 'unicode 4-byte emoji counts as 2 UTF-16 code units (documented)',
      // 40x emoji (each is 2 UTF-16 units, so 80 units total) -> at cap
      input: '\u{1F600}'.repeat(40),
      expected: '\u{1F600}'.repeat(40),
    },
  ];

  for (const { name, input, expected } of cases) {
    it(`${name}`, () => {
      expect(titleFromDescription(input)).toBe(expected);
    });
  }
});
