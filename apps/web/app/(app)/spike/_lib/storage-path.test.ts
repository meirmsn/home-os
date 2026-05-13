// What: Unit tests for spikePath() — pins the exact format string the
//       RLS policy depends on (D3).
// Why:  Format drift = silent RLS rejections at upload time. The string
//       has to match `{user_id}/spike/{ISO-no-colons}-{slot}.jpg`
//       exactly.

import { describe, expect, it } from 'vitest';
import { spikePath } from './storage-path';

describe('spikePath', () => {
  it('returns the exact format string for slot A', () => {
    expect(
      spikePath(
        '7e2a1234-1234-1234-1234-123456789abc',
        'A',
        new Date('2026-05-13T18:30:45.000Z')
      )
    ).toBe(
      '7e2a1234-1234-1234-1234-123456789abc/spike/2026-05-13T18-30-45Z-A.jpg'
    );
  });

  it('returns the exact format string for slot B', () => {
    expect(
      spikePath(
        '7e2a1234-1234-1234-1234-123456789abc',
        'B',
        new Date('2026-05-13T18:30:45.000Z')
      )
    ).toBe(
      '7e2a1234-1234-1234-1234-123456789abc/spike/2026-05-13T18-30-45Z-B.jpg'
    );
  });

  it('strips milliseconds even when non-zero', () => {
    expect(spikePath('user-1', 'A', new Date('2026-05-13T18:30:45.789Z'))).toBe(
      'user-1/spike/2026-05-13T18-30-45Z-A.jpg'
    );
  });

  it('throws on empty userId', () => {
    expect(() =>
      spikePath('', 'A', new Date('2026-05-13T18:30:45.000Z'))
    ).toThrow(/userId/);
  });

  it('throws on invalid slot', () => {
    expect(() =>
      // @ts-expect-error - exercising the runtime guard
      spikePath('user-1', 'C', new Date('2026-05-13T18:30:45.000Z'))
    ).toThrow(/slot/);
  });

  it('leading user-id segment matches the RLS predicate gate', () => {
    // RLS gate: (storage.foldername(name))[1] = auth.uid()::text
    // → first path segment must equal the user id verbatim.
    const userId = 'abc-def';
    const path = spikePath(userId, 'A', new Date('2026-05-13T18:30:45.000Z'));
    expect(path.split('/')[0]).toBe(userId);
  });
});
