// What: Unit tests for groupTouchpoints — grouping by touchpoint_id, date =
//       min(created_at), per-slot URL map, failed-sign drop, sort + count.
// Why:  spec § Tests § group-touchpoints.test.ts — the pure transform is the
//       contract between the PostgREST result and <PhotoComparison>; cover it
//       without a stack.

import { describe, expect, it } from 'vitest';
import { groupTouchpoints, type PhotoRow } from './group-touchpoints';

const TP_EARLY = 'aaaaaaaa-0000-0000-0000-000000000001';
const TP_MID = 'aaaaaaaa-0000-0000-0000-000000000002';
const TP_LATE = 'aaaaaaaa-0000-0000-0000-000000000003';

/**
 *
 */
function row(
  partial: Partial<PhotoRow> & Pick<PhotoRow, 'touchpoint_id'>
): PhotoRow {
  return {
    touchpoint_type: 'primary',
    slot: 'wide',
    storage_path: `path/${partial.touchpoint_id}/${partial.slot ?? 'wide'}.jpg`,
    created_at: '2026-05-01T00:00:00Z',
    ...partial,
  };
}

describe('groupTouchpoints', () => {
  it('groups rows by touchpoint_id — one group per distinct id', () => {
    const rows = [
      row({ touchpoint_id: TP_EARLY, slot: 'wide' }),
      row({ touchpoint_id: TP_EARLY, slot: 'medium' }),
      row({ touchpoint_id: TP_LATE, slot: 'wide' }),
    ];
    const signed = new Map(
      rows.map((r) => [r.storage_path, `signed://${r.storage_path}`])
    );
    const result = groupTouchpoints(rows, signed);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual([TP_EARLY, TP_LATE]);
  });

  it('derives touchpoint date = min(created_at) across the group (multi-slot stagger)', () => {
    const rows = [
      row({
        touchpoint_id: TP_MID,
        slot: 'medium',
        created_at: '2026-05-10T08:05:00Z',
      }),
      row({
        touchpoint_id: TP_MID,
        slot: 'wide',
        created_at: '2026-05-10T08:00:00Z',
      }),
      row({
        touchpoint_id: TP_MID,
        slot: 'closeup',
        created_at: '2026-05-10T08:10:00Z',
      }),
    ];
    const signed = new Map(
      rows.map((r) => [r.storage_path, `s://${r.storage_path}`])
    );
    const result = groupTouchpoints(rows, signed);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-05-10T08:00:00Z');
  });

  it('populates the slot map; missing slots are undefined', () => {
    const rows = [
      row({ touchpoint_id: TP_EARLY, slot: 'wide' }),
      row({ touchpoint_id: TP_EARLY, slot: 'closeup' }),
    ];
    const signed = new Map(
      rows.map((r) => [r.storage_path, `s://${r.storage_path}`])
    );
    const result = groupTouchpoints(rows, signed);
    expect(result[0]!.photos.wide).toBe(`s://${rows[0]!.storage_path}`);
    expect(result[0]!.photos.closeup).toBe(`s://${rows[1]!.storage_path}`);
    expect(result[0]!.photos.medium).toBeUndefined();
  });

  it('sorts output by date ascending and reports count via length', () => {
    const rows = [
      row({ touchpoint_id: TP_LATE, created_at: '2026-05-20T00:00:00Z' }),
      row({ touchpoint_id: TP_EARLY, created_at: '2026-05-01T00:00:00Z' }),
      row({ touchpoint_id: TP_MID, created_at: '2026-05-10T00:00:00Z' }),
    ];
    const signed = new Map(
      rows.map((r) => [r.storage_path, `s://${r.storage_path}`])
    );
    const result = groupTouchpoints(rows, signed);
    expect(result.map((t) => t.id)).toEqual([TP_EARLY, TP_MID, TP_LATE]);
    expect(result).toHaveLength(3);
  });

  it('drops rows whose storage_path failed to sign (absent from the map)', () => {
    const rows = [
      row({ touchpoint_id: TP_EARLY, slot: 'wide' }),
      row({ touchpoint_id: TP_EARLY, slot: 'medium' }),
    ];
    // Only the wide path signed; medium failed and is omitted from the map.
    const signed = new Map([
      [rows[0]!.storage_path, `s://${rows[0]!.storage_path}`],
    ]);
    const result = groupTouchpoints(rows, signed);
    expect(result[0]!.photos.wide).toBe(`s://${rows[0]!.storage_path}`);
    expect(result[0]!.photos.medium).toBeUndefined();
  });

  it('carries the touchpoint_type hint from the first row in the group', () => {
    const rows = [
      row({ touchpoint_id: TP_LATE, touchpoint_type: 'close', slot: 'wide' }),
    ];
    const signed = new Map(
      rows.map((r) => [r.storage_path, `s://${r.storage_path}`])
    );
    const result = groupTouchpoints(rows, signed);
    expect(result[0]!.type).toBe('close');
  });

  it('returns an empty array for no rows', () => {
    expect(groupTouchpoints([], new Map())).toEqual([]);
  });
});
