// @vitest-environment happy-dom
// What: Unit tests for <ComparePhotosLink> — the >= 2 gating contract + the
//       link href shape shared across the three card-state views.
// Why:  spec § Entry points + G6 — pin the threshold and href so a refactor
//       can't silently change either.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ComparePhotosLink } from './ComparePhotosLink';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

afterEach(() => cleanup());

describe('<ComparePhotosLink />', () => {
  it('renders the link at the >= 2 threshold', () => {
    render(<ComparePhotosLink cardId={CARD_ID} photoTouchpointCount={2} />);
    const link = screen.getByTestId('compare-photos-link');
    expect(link.textContent).toBe('Compare photos');
    expect(link.getAttribute('href')).toBe(`/cards/${CARD_ID}/compare`);
  });

  it('renders nothing when count is 1', () => {
    render(<ComparePhotosLink cardId={CARD_ID} photoTouchpointCount={1} />);
    expect(screen.queryByTestId('compare-photos-link')).toBeNull();
  });

  it('renders nothing when count is 0', () => {
    render(<ComparePhotosLink cardId={CARD_ID} photoTouchpointCount={0} />);
    expect(screen.queryByTestId('compare-photos-link')).toBeNull();
  });
});
