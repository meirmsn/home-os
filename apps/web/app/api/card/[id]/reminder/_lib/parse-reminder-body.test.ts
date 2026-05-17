// What: Unit tests for parseReminderBody. Covers the happy path (ISO
//       date + null clear), all known reject paths (malformed regex,
//       semantic-invalid date, wrong type), and the forward-compat tolerance
//       of extra fields.

import { describe, expect, it } from 'vitest';
import { parseReminderBody } from './parse-reminder-body';

describe('parseReminderBody — happy paths', () => {
  it('accepts a valid future ISO date', () => {
    const r = parseReminderBody({ reminder_date: '2026-06-15' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reminder_date).toBe('2026-06-15');
  });

  it('accepts a valid past ISO date (D5 allows past dates)', () => {
    const r = parseReminderBody({ reminder_date: '2020-01-01' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reminder_date).toBe('2020-01-01');
  });

  it('accepts the literal null (clear)', () => {
    const r = parseReminderBody({ reminder_date: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reminder_date).toBe(null);
  });

  it('accepts a leap-year Feb 29', () => {
    const r = parseReminderBody({ reminder_date: '2024-02-29' });
    expect(r.ok).toBe(true);
  });

  it('tolerates extra unknown fields (forward-compat)', () => {
    const r = parseReminderBody({
      reminder_date: '2026-06-15',
      extra: 'ignored',
    });
    expect(r.ok).toBe(true);
  });
});

describe('parseReminderBody — rejects malformed shapes', () => {
  it('rejects non-object body', () => {
    expect(parseReminderBody(null).ok).toBe(false);
    expect(parseReminderBody('hello').ok).toBe(false);
    expect(parseReminderBody(123).ok).toBe(false);
    expect(parseReminderBody([]).ok).toBe(false);
  });

  it('rejects missing reminder_date field', () => {
    const r = parseReminderBody({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('reminder_date');
  });

  it('rejects non-string non-null reminder_date (number)', () => {
    const r = parseReminderBody({ reminder_date: 20260615 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('reminder_date');
  });

  it('rejects non-ISO date formats — MM/DD/YYYY', () => {
    const r = parseReminderBody({ reminder_date: '06/15/2026' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/YYYY-MM-DD/);
  });

  it('rejects empty string', () => {
    const r = parseReminderBody({ reminder_date: '' });
    expect(r.ok).toBe(false);
  });

  it('rejects regex bypass with extra suffix', () => {
    const r = parseReminderBody({ reminder_date: '2026-06-15extra' });
    expect(r.ok).toBe(false);
  });
});

describe('parseReminderBody — rejects semantic-invalid calendar dates (Gotcha #1)', () => {
  it('rejects month 13', () => {
    const r = parseReminderBody({ reminder_date: '2026-13-15' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/calendar/);
  });

  it('rejects Feb 30 (round-trip catches it)', () => {
    const r = parseReminderBody({ reminder_date: '2026-02-30' });
    expect(r.ok).toBe(false);
  });

  it('rejects Apr 31 (round-trip catches it)', () => {
    const r = parseReminderBody({ reminder_date: '2026-04-31' });
    expect(r.ok).toBe(false);
  });

  it('rejects Feb 29 in a non-leap year', () => {
    const r = parseReminderBody({ reminder_date: '2023-02-29' });
    expect(r.ok).toBe(false);
  });

  it('rejects day=00', () => {
    const r = parseReminderBody({ reminder_date: '2026-06-00' });
    expect(r.ok).toBe(false);
  });

  it('rejects month=00', () => {
    const r = parseReminderBody({ reminder_date: '2026-00-15' });
    expect(r.ok).toBe(false);
  });
});
