// What: Unit tests for <CheckInTimeline />. Verifies empty state,
//       expanded/collapsed entries, photo thumbnails, notes display.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CheckInTimeline, type CheckInEntry } from './CheckInTimeline';

afterEach(() => cleanup());

const ENTRY_1: CheckInEntry = {
  id: 'aaa',
  createdAt: '2026-05-25T10:00:00Z',
  notes: 'Looks the same',
  photos: [
    { slot: 'wide', url: 'https://example.com/wide.jpg' },
    { slot: 'zoom', url: 'https://example.com/zoom.jpg' },
  ],
};

const ENTRY_2: CheckInEntry = {
  id: 'bbb',
  createdAt: '2026-05-15T10:00:00Z',
  notes: 'Slight change noticed',
  photos: [],
};

const ENTRY_3: CheckInEntry = {
  id: 'ccc',
  createdAt: '2026-05-05T10:00:00Z',
  notes: null,
  photos: [{ slot: 'wide', url: 'https://example.com/old.jpg' }],
};

describe('<CheckInTimeline />', () => {
  it('renders empty state when no entries', () => {
    render(<CheckInTimeline entries={[]} />);
    expect(screen.getByTestId('checkin-timeline-empty')).toBeTruthy();
    expect(screen.getByText('No check-ins yet.')).toBeTruthy();
  });

  it('renders the most recent entry expanded', () => {
    render(<CheckInTimeline entries={[ENTRY_1, ENTRY_2]} />);
    expect(screen.getByTestId('checkin-entry-expanded')).toBeTruthy();
    expect(screen.getByText('Looks the same')).toBeTruthy();
  });

  it('renders older entries as collapsed <details>', () => {
    render(<CheckInTimeline entries={[ENTRY_1, ENTRY_2]} />);
    const collapsed = screen.getAllByTestId('checkin-entry-collapsed');
    expect(collapsed).toHaveLength(1);
  });

  it('renders photo thumbnails', () => {
    render(<CheckInTimeline entries={[ENTRY_1]} />);
    expect(screen.getByTestId('checkin-photo-wide')).toBeTruthy();
    expect(screen.getByTestId('checkin-photo-zoom')).toBeTruthy();
  });

  it('renders entries without notes (no crash)', () => {
    render(<CheckInTimeline entries={[ENTRY_3]} />);
    expect(screen.getByTestId('checkin-entry-expanded')).toBeTruthy();
  });

  it('renders multiple entries in order', () => {
    render(<CheckInTimeline entries={[ENTRY_1, ENTRY_2, ENTRY_3]} />);
    const expanded = screen.getAllByTestId('checkin-entry-expanded');
    const collapsed = screen.getAllByTestId('checkin-entry-collapsed');
    expect(expanded).toHaveLength(1);
    expect(collapsed).toHaveLength(2);
  });
});
